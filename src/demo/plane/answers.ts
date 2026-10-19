// a Walkthrough's scripted question plays its recording, else a suggested prompt plays the answer demo-data composed
// from the seed, else live Pebble answers, else a calm offline reply, each as the answer so far
import { z } from "zod";

import {
  type AnswerLine,
  AnswerLineSchema,
  type PebbleAnswer,
  PebbleAnswerSchema,
  type PebbleRequest,
} from "#src/pebble/wire";
import { GroundedError } from "#src/sdk/index";

import { preparedAnswersSchema } from "./seed/answers.ts";

const WORD_MS = 60_000 / 400;
export const OFFLINE_REPLY = "Pebble isn't connected in this demo.";

type Armed = { question: string; issueId: string; recorded: PebbleAnswer; only: boolean };
let armed: Armed | null = null;

/** Arms one recorded answer for `question` on `issueId`'s screen; without `only`, a connected Pebble answers it live. */
export function recordAnswer(
  question: string,
  issueId: string,
  recorded: PebbleAnswer,
  only = false,
): void {
  armed = { question, issueId, recorded, only };
}

export function clearAnswer(): void {
  armed = null;
}

const ConnectedSchema = z.object({ connected: z.literal(true) });

/** Whether the demo's Worker holds a model key, so Pebble answers live. */
export async function pebbleStatus(): Promise<boolean> {
  try {
    const response = await fetch("/api/pebble/status");
    return response.ok && ConnectedSchema.safeParse(await response.json()).success;
  } catch {
    return false;
  }
}

// the screen names its Issue, so a recording plays only where its Walkthrough asks it
function names(context: string, word: string): boolean {
  const id = word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\w-])${id}(?![\\w-])`, "u").test(context);
}

/** answers.json, Pebble's answers to every page's suggested prompts. */
export const PreparedAnswersSchema = preparedAnswersSchema(PebbleAnswerSchema);
export type PreparedAnswer = z.infer<typeof PreparedAnswersSchema>["answers"][number];

// a prompt as typed or clicked: any case, spacing and closing punctuation
const promptKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .replace(/[\s?.!]+$/u, "")
    .trim();

// the page's own line, so a record its context only lists (a Candidate on its Issue) picks no answer
const screenOf = (context: string) =>
  /<screen[^>]*>\n([\s\S]*?)\n<\/screen>/u.exec(context)?.[1] ?? context;

/** The Agent a question was asked about, as its screen line names it. */
export const screenAgent = (context: string) => /<screen[^>]*\bagent="([^"]+)"/u.exec(context)?.[1];

/** The prepared answer to the question, on the screen that names the most of its words, if any. */
export function preparedAnswer(
  answers: readonly PreparedAnswer[],
  request: PebbleRequest,
): PebbleAnswer | undefined {
  const asked = promptKey(request.messages.at(-1)?.text ?? "");
  const screen = screenOf(request.context);
  return answers
    .filter(
      ({ prompt, on }) => promptKey(prompt) === asked && on.every((word) => names(screen, word)),
    )
    .toSorted((left, right) => right.on.length - left.on.length)[0]?.answer;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

type Message = PebbleAnswer["messages"][number];
type Part = Extract<Message, { role: "assistant" }>["content"][number];

// a thinking or text part cut to its first words, as a stream has it so far
function cut(part: Part, words: string): Part {
  switch (part.type) {
    case "thinking":
      return { ...part, thinking: words };
    case "text":
      return { ...part, text: words };
    case "toolCall":
      return part;
  }
}

/** A recording as it streams: each message's thinking and text word by word, its tool calls and results whole. */
async function* play(
  { messages, actions }: PebbleAnswer,
  signal: AbortSignal,
): AsyncGenerator<PebbleAnswer> {
  for (const [at, message] of messages.entries()) {
    if (signal.aborted) {
      return;
    }
    const before = messages.slice(0, at);
    if (message.role === "toolResult") {
      yield { messages: [...before, message], actions: [] };
      await pause(WORD_MS, signal);
      continue;
    }
    for (const [index, part] of message.content.entries()) {
      const shown = message.content.slice(0, index);
      const text = part.type === "text" ? part.text : part.type === "thinking" ? part.thinking : "";
      let said = "";
      for (const word of text === "" ? [""] : text.split(/(?<=\s)/u)) {
        if (signal.aborted) {
          return;
        }
        said += word;
        yield {
          messages: [...before, { ...message, content: [...shown, cut(part, said)] }],
          actions: [],
        };
        await pause(WORD_MS, signal);
      }
    }
  }
  if (!signal.aborted) {
    yield { messages, actions };
  }
}

const read = (text: string): AnswerLine => AnswerLineSchema.parse(JSON.parse(text));

// the Worker refuses as { error }, thrown like an SDK refusal, and streams its answer as lines of JSON
async function* live(request: PebbleRequest, signal: AbortSignal): AsyncGenerator<PebbleAnswer> {
  const response = await fetch("/api/pebble", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok || response.body === null) {
    const line = AnswerLineSchema.safeParse(await response.json().catch(() => null)).data;
    const message =
      line !== undefined && "error" in line
        ? line.error
        : `${response.status} ${response.statusText}`;
    throw new GroundedError(message, response.status, undefined);
  }
  let buffered = "";
  for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
    buffered += chunk;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const text of lines.filter((each) => each.trim() !== "")) {
      const line = read(text);
      if ("error" in line) {
        throw new Error(line.error);
      }
      yield line.answer;
    }
  }
}

const OFFLINE: PebbleAnswer = {
  messages: [{ role: "assistant", content: [{ type: "text", text: OFFLINE_REPLY }] }],
  actions: [],
};

/**
 * A question's answer as it streams: the armed recording when it matches, else the `prepared` answer to a suggested
 * prompt, else live Pebble when `connected`, else the offline reply.
 */
export async function* pebbleAnswer(
  request: PebbleRequest,
  signal: AbortSignal,
  connected: () => Promise<boolean>,
  prepared: (request: PebbleRequest) => Promise<PebbleAnswer | undefined> = async () => undefined,
): AsyncGenerator<PebbleAnswer> {
  const recording =
    armed !== null &&
    armed.question === request.messages.at(-1)?.text &&
    names(request.context, armed.issueId)
      ? armed
      : null;
  if (recording !== null) {
    clearAnswer();
    if (!recording.only && (await connected())) {
      try {
        yield* live(request, signal);
        return;
      } catch {
        // a refusing Pebble leaves the recording to answer
      }
    }
    yield* play(recording.recorded, signal);
    return;
  }
  const composed = await prepared(request);
  if (composed !== undefined) {
    yield* play(composed, signal);
    return;
  }
  if (await connected()) {
    yield* live(request, signal);
    return;
  }
  yield OFFLINE;
}
