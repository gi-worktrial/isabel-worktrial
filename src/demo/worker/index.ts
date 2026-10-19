// the model key stays in this route and answers stream as lines of JSON, each the answer so far
import { parseStreamingJson } from "@earendil-works/pi-ai/utils/json-parse";
import { Agent, run, setDefaultOpenAIKey, type AgentInputItem } from "@openai/agents";
import { z } from "zod";

import {
  actionIds,
  type AnswerLine,
  type PebbleAction,
  PebbleActionSchema,
  type PebbleAnswer,
  type PebbleRequest,
  PebbleRequestSchema,
} from "#src/pebble/wire";
import { errorMessage } from "#src/ui/format-extra";

const INSTRUCTIONS = `You are Pebble, a colleague beside an engineer in Grounded. Grounded finds Issues in the Customer Agent's production Traces. Each Issue has Traces that show it, Evals that reproduce it and Candidates (proposed Fixes) whose Eval results compare New Evals with Existing ones. An Issue is Detected, then Reviewing once validated, then Resolved when its approved Candidate is marked as shipped, or Dismissed with a reason.

Writing
- First person, plain words, at most three sentences unless asked for more. Use a list only for steps or parallel facts.
- Say what you observed, what it suggests and what is missing. Keep observations apart from inferences.
- No bold, headings, tables, emojis, em dashes, preamble, restated question or closing offer.
- Product words only: Issue, Trace, Eval, Criterion, Grade, Candidate, Fix, Eval run, New Evals, Existing Evals, Grounded Evals, Automation. Never say Harbor, task, branch, job, push, commit, merge, pull request, sandbox or span.
- Name records as the context labels them: an Issue by its id (GRD-3), a Trace by its label (Trace 3f9a1c2b), an Eval or a Candidate by its title. Never write a full trace or session id in the reply.

What is in view
The context below is the screen and the records it names, read for this question; answer only from it, and the newest context wins over earlier messages.
- You have no tools here. Never claim you ran anything or read records the context does not include.
- Results prove only the Candidate and Evals they ran. Out of date results need a rerun before they count.
- The engineer validates, dismisses, approves and marks as shipped. You never do these and never say they happened.

Actions
Actions are chips under your reply that run only when the engineer clicks. Offer up to three, most useful first, and none when nothing helps. Never mention chips or buttons in the reply, and never describe their work as done. Use only ids that appear in the context. A mention such as @[UNI-3] names a record the context includes.
- open_issue {issue}, open_candidate {issue, candidate}, open_eval {eval}, open_trace {session, trace}: open a record you point the engineer to.
- rerun {issue, candidate}: rerun a Candidate's Evals when its results are missing or out of date.
- exclude_trace {issue, trace}: remove a Trace that does not show this failure from the Issue. include_trace {issue, trace}: add one that does.`;

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_DEFAULT_MODEL: z.string().default("gpt-6-astra"),
});
type Env = z.infer<typeof EnvSchema>;

const Id = z.string().min(1);
// actions stay flat and named like their chips, which the model fills more reliably than nested records
export const ModelReplySchema = z.strictObject({
  reply: z.string().min(1),
  actions: z
    .array(
      z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("open_issue"), issue: Id }),
        z.strictObject({ kind: z.literal("open_candidate"), issue: Id, candidate: Id }),
        z.strictObject({ kind: z.literal("open_eval"), eval: Id }),
        z.strictObject({ kind: z.literal("open_trace"), session: Id, trace: Id }),
        z.strictObject({ kind: z.literal("rerun"), issue: Id, candidate: Id }),
        z.strictObject({ kind: z.literal("include_trace"), issue: Id, trace: Id }),
        z.strictObject({ kind: z.literal("exclude_trace"), issue: Id, trace: Id }),
      ]),
    )
    .max(3),
});
type ModelAction = z.infer<typeof ModelReplySchema>["actions"][number];

const ReasoningDeltaSchema = z.object({
  type: z.literal("response.reasoning_summary_text.delta"),
  delta: z.string(),
});

// long hex ids leave the reply, and a trailing one is held back while it could still grow
export function withoutIds(reply: string, done: boolean): string {
  const settled = done ? reply : reply.replace(/[0-9a-f]+$/iu, "");
  return settled.replace(/[0-9a-f]{16,} ?/giu, "");
}

function toAction(action: ModelAction): PebbleAction {
  switch (action.kind) {
    case "open_issue":
      return { kind: "open", ref: { record: "issue", issue: action.issue } };
    case "open_candidate":
      return {
        kind: "open",
        ref: { record: "candidate", issue: action.issue, candidate: action.candidate },
      };
    case "open_eval":
      return { kind: "open", ref: { record: "eval", eval: action.eval } };
    case "open_trace":
      return {
        kind: "open",
        ref: { record: "trace", session: action.session, trace: action.trace },
      };
    default:
      return action;
  }
}

/** The model's actions as chips, dropping any that names a record the context never mentions. */
export function checkedActions(actions: readonly ModelAction[], context: string): PebbleAction[] {
  return actions.flatMap((action) => {
    const parsed = PebbleActionSchema.safeParse(toAction(action));
    return parsed.success && actionIds(parsed.data).every((id) => context.includes(id))
      ? [parsed.data]
      : [];
  });
}

const PartialSchema = z.object({ reply: z.string() });

// Pebble's reasoning and reply so far as one assistant message, with its chips once checked
const answered = (
  reasoning: string,
  reply: string,
  actions: PebbleAction[] = [],
): PebbleAnswer => ({
  messages: [
    {
      role: "assistant",
      content: [
        ...(reasoning === "" ? [] : [{ type: "thinking" as const, thinking: reasoning }]),
        ...(reply === "" ? [] : [{ type: "text" as const, text: reply }]),
      ],
    },
  ],
  actions,
});

// reasoning streams first, then the reply as it grows, and actions follow once checked
async function answer(
  { context, messages }: PebbleRequest,
  env: Env,
  signal: AbortSignal,
  emit: (answer: PebbleAnswer) => void,
) {
  const agent = new Agent({
    name: "Pebble",
    instructions: `${INSTRUCTIONS}\n\nContext:\n${context}`,
    model: env.OPENAI_DEFAULT_MODEL,
    modelSettings: { reasoning: { effort: "low", summary: "auto" } },
    outputType: ModelReplySchema,
  });
  const items = messages.map((message): AgentInputItem =>
    message.role === "user"
      ? { role: "user", content: message.text }
      : {
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: message.text }],
        },
  );
  // pebble has no tools, so one turn answers
  const result = await run(agent, items, { maxTurns: 1, signal, stream: true });
  let written = "";
  let reasoning = "";
  let said = "";
  const say = (reply: string) => {
    if (reply.length > said.length && reply.startsWith(said)) {
      said = reply;
      emit(answered(reasoning, said));
    }
  };
  for await (const event of result) {
    if (event.type !== "raw_model_stream_event") {
      continue;
    }
    const { data } = event;
    if (data.type === "output_text_delta") {
      written += data.delta;
      const partial = PartialSchema.safeParse(parseStreamingJson(written));
      say(partial.success ? withoutIds(partial.data.reply, false) : "");
    } else if (data.type === "model" && said === "") {
      const delta = ReasoningDeltaSchema.safeParse(data.event);
      if (delta.success) {
        reasoning += delta.data.delta;
        emit(answered(reasoning, said));
      }
    }
  }
  await result.completed;
  const output = result.finalOutput;
  if (output === undefined) {
    throw new Error("Pebble did not answer.");
  }
  const reply = withoutIds(output.reply, true);
  if (!reply.startsWith(said)) {
    throw new Error("Pebble's answer could not be read.");
  }
  emit(answered(reasoning, reply, checkedActions(output.actions, context)));
}

const ANSWER_TIMEOUT_MS = 60_000;

async function respond(request: Request, env: Env): Promise<Response> {
  const parsed = PebbleRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    const error = "Pebble could not read the question. Reload the page and ask again.";
    return Response.json({ error }, { status: 400 });
  }
  if (env.OPENAI_API_KEY === "") {
    return Response.json(
      { error: "Pebble needs OPENAI_API_KEY in .env to answer." },
      { status: 503 },
    );
  }
  setDefaultOpenAIKey(env.OPENAI_API_KEY);
  const abort = new AbortController();
  const signal = AbortSignal.any([
    request.signal,
    abort.signal,
    AbortSignal.timeout(ANSWER_TIMEOUT_MS),
  ]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(output) {
      const line = (sent: AnswerLine) =>
        output.enqueue(encoder.encode(`${JSON.stringify(sent)}\n`));
      answer(parsed.data, env, signal, (sofar) => line({ answer: sofar }))
        .catch((error: unknown) =>
          line({ error: signal.aborted ? "Pebble did not answer in time." : errorMessage(error) }),
        )
        .then(() => output.close())
        // a cancelled answer has no reader left to tell
        .catch(() => {});
    },
    cancel: () => abort.abort(),
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
}

async function handle(request: Request, bindings: unknown): Promise<Response> {
  const env = EnvSchema.parse(bindings);
  const route = `${request.method} ${new URL(request.url).pathname}`;
  switch (route) {
    case "GET /api/pebble/status":
      return Response.json({ connected: env.OPENAI_API_KEY !== "" });
    case "POST /api/pebble":
      return respond(request, env);
    default:
      return Response.json({ error: `Nothing answers ${route}.` }, { status: 404 });
  }
}

const worker = { fetch: handle };
export default worker;
