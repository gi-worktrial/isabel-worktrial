import { assert, expect, test, vi } from "vitest";

import { type AnswerLine, AnswerLineSchema } from "#src/pebble/wire";

import worker, { checkedActions, withoutIds } from "./index.ts";

const model = vi.hoisted((): { instructions: string; actions: unknown[] } => ({
  instructions: "",
  actions: [],
}));

vi.mock("@openai/agents", () => ({
  Agent: function Agent({ instructions }: { instructions: string }) {
    model.instructions = instructions;
  },
  setDefaultOpenAIKey: vi.fn<(key: string) => void>(),
  async run() {
    const finalOutput = { reply: "This Candidate changes the answer.", actions: model.actions };
    const reasoning = {
      type: "response.reasoning_summary_text.delta",
      delta: "Checking the Candidate.",
    };
    const events = [
      { type: "raw_model_stream_event", data: { type: "model", event: reasoning } },
      {
        type: "raw_model_stream_event",
        data: { type: "output_text_delta", delta: JSON.stringify(finalOutput) },
      },
    ];
    return {
      [Symbol.asyncIterator]: async function* () {
        yield* events;
      },
      completed: Promise.resolve(),
      finalOutput,
    };
  },
}));

const CONTEXT = `<issue id="GRD-1">\n<candidates>guardrail</candidates>\n<traces>trace t1 session s1</traces>\n</issue>`;

function post(body: unknown, env: object = { OPENAI_API_KEY: "test-only" }) {
  return worker.fetch(
    new Request("http://localhost/api/pebble", { method: "POST", body: JSON.stringify(body) }),
    env,
  );
}

// each line of the answer stream, the answer so far
async function ask(context: string, text: string): Promise<AnswerLine[]> {
  const response = await post({ context, messages: [{ role: "user", text }] });
  assert(response.body !== null, "The answer has no stream");
  return (await response.text())
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => AnswerLineSchema.parse(JSON.parse(line)));
}

const reply = (thinking: string, text?: string) => ({
  role: "assistant",
  content: [
    { type: "thinking", thinking },
    ...(text === undefined ? [] : [{ type: "text", text }]),
  ],
});

test("an answer streams its reasoning, its reply, then its checked actions, with the context in its instructions", async () => {
  model.actions = [{ kind: "rerun", issue: "GRD-1", candidate: "guardrail" }];
  const lines = await ask(CONTEXT, "What next?");
  expect(lines).toEqual([
    { answer: { messages: [reply("Checking the Candidate.")], actions: [] } },
    {
      answer: {
        messages: [reply("Checking the Candidate.", "This Candidate changes the answer.")],
        actions: [],
      },
    },
    {
      answer: {
        messages: [reply("Checking the Candidate.", "This Candidate changes the answer.")],
        actions: [{ kind: "rerun", issue: "GRD-1", candidate: "guardrail" }],
      },
    },
  ]);
  expect(model.instructions).toContain("You never do these");
  expect(model.instructions).toContain(`Context:\n${CONTEXT}`);
});

test("an action naming a record the context never mentions is dropped", async () => {
  model.actions = [{ kind: "rerun", issue: "GRD-1", candidate: "elsewhere" }];
  const last = (await ask(CONTEXT, "Rerun it")).at(-1);
  expect(last !== undefined && "answer" in last && last.answer.actions).toEqual([]);
});

test("each flat model action maps to the chip it offers", () => {
  expect(
    checkedActions(
      [
        { kind: "open_issue", issue: "GRD-1" },
        { kind: "open_candidate", issue: "GRD-1", candidate: "guardrail" },
        { kind: "open_eval", eval: "guardrail" },
        { kind: "open_trace", session: "s1", trace: "t1" },
        { kind: "open_trace", session: "s2", trace: "t1" },
        { kind: "exclude_trace", issue: "GRD-1", trace: "t1" },
        { kind: "include_trace", issue: "GRD-2", trace: "t1" },
      ],
      CONTEXT,
    ),
  ).toEqual([
    { kind: "open", ref: { record: "issue", issue: "GRD-1" } },
    { kind: "open", ref: { record: "candidate", issue: "GRD-1", candidate: "guardrail" } },
    { kind: "open", ref: { record: "eval", eval: "guardrail" } },
    { kind: "open", ref: { record: "trace", session: "s1", trace: "t1" } },
    { kind: "exclude_trace", issue: "GRD-1", trace: "t1" },
  ]);
});

test("an answer drops raw ids, and each streamed part starts what stays", () => {
  const written = "The release skipped the 9899a3f1c2d4e5b6a7c8 budget read.";
  const shown = "The release skipped the budget read.";
  expect(withoutIds(written, true)).toBe(shown);
  for (let at = 0; at <= written.length; at += 1) {
    expect(shown.startsWith(withoutIds(written.slice(0, at), false))).toBe(true);
  }
  expect(withoutIds("Release", false)).toBe("Releas");
});

test("a malformed question is refused, and so is any question without a model key", async () => {
  const unread = await post({ context: "", messages: [] });
  expect(unread.status).toBe(400);
  expect(await unread.json()).toEqual({
    error: "Pebble could not read the question. Reload the page and ask again.",
  });
  const unkeyed = await post({ context: "", messages: [{ role: "user", text: "Hi" }] }, {});
  expect(unkeyed.status).toBe(503);
});

const status = (env: object) =>
  worker
    .fetch(new Request("http://localhost/api/pebble/status"), env)
    .then((response) => response.json());

test("status says whether a model key is set", async () => {
  expect(await status({ OPENAI_API_KEY: "test-only" })).toEqual({ connected: true });
  expect(await status({})).toEqual({ connected: false });
});
