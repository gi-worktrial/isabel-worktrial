import { afterEach, expect, test, vi } from "vitest";

import type { PebbleAnswer, PebbleRequest } from "#src/pebble/wire";
import { GroundedError } from "#src/sdk/index";
import { ISSUE } from "#test/tiny-seed";

import {
  clearAnswer,
  OFFLINE_REPLY,
  pebbleAnswer,
  type PreparedAnswer,
  preparedAnswer,
  recordAnswer,
  screenAgent,
} from "./answers.ts";

const SCREEN = `The engineer is viewing Issue ${ISSUE}.`;
const question = (text: string, context = SCREEN) => ({
  messages: [
    { role: "user" as const, text: "Earlier?" },
    { role: "assistant" as const, text: "Earlier." },
    { role: "user" as const, text },
  ],
  context,
});
const connected = async () => true;
const disconnected = async () => false;

// live Pebble answers with this response, and the test reads what was sent
function live(answer: () => Response) {
  const fetched = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
    answer(),
  );
  vi.stubGlobal("fetch", fetched);
  return { fetched, sent: (call = 0) => JSON.parse(String(fetched.mock.calls[call]?.[1]?.body)) };
}
const refusing = () => Response.json({ error: "No key" }, { status: 503 });
const said = (text: string, thinking?: string): PebbleAnswer => ({
  messages: [
    {
      role: "assistant",
      content: [
        ...(thinking === undefined ? [] : [{ type: "thinking" as const, thinking }]),
        { type: "text", text },
      ],
    },
  ],
  actions: [],
});
const liveReply = () =>
  new Response(
    [{ answer: said("Li") }, { answer: said("Live.") }]
      .map((line) => `${JSON.stringify(line)}\n`)
      .join(""),
  );

// every answer so far, and the words of the last
async function read(answers: AsyncIterable<PebbleAnswer>) {
  const seen: PebbleAnswer[] = [];
  for await (const answer of answers) {
    seen.push(answer);
  }
  const last = seen.at(-1);
  const text = (type: "text" | "thinking") =>
    (last?.messages ?? []).flatMap((message) =>
      message.role === "assistant"
        ? message.content.flatMap((part) =>
            part.type === "text" && type === "text"
              ? [part.text]
              : part.type === "thinking" && type === "thinking"
                ? [part.thinking]
                : [],
          )
        : [],
    );
  return {
    reply: text("text").join(""),
    reasoning: text("thinking").join(""),
    actions: last?.actions ?? [],
    seen,
  };
}

const ask = (
  text: string,
  online: () => Promise<boolean>,
  context?: string,
  signal = new AbortController().signal,
) => read(pebbleAnswer(question(text, context), signal, online));

afterEach(() => {
  clearAnswer();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("a connected Pebble gets the screen and every turn, and a refusal throws as the SDK throws one", async () => {
  const { sent } = live(liveReply);
  const answered = await ask("Is it real?", connected);
  expect(answered.reply).toBe("Live.");
  expect(answered.seen).toHaveLength(2);
  expect(sent()).toEqual(question("Is it real?"));

  live(refusing);
  await expect(ask("Is it real?", connected)).rejects.toBeInstanceOf(GroundedError);
});

test("without a connection Pebble says so calmly and never calls the Worker", async () => {
  const { fetched } = live(liveReply);
  expect(await ask("Is it real?", disconnected)).toMatchObject({
    reply: OFFLINE_REPLY,
    reasoning: "",
    actions: [],
  });
  expect(fetched).not.toHaveBeenCalled();
});

test("a scripted question on its Issue plays its recorded reasoning, reply and chips word by word, once", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 200 });
  const { fetched } = live(liveReply);
  const action = { kind: "rerun", issue: ISSUE, candidate: "guardrail" } as const;
  recordAnswer(
    "Is it real?",
    ISSUE,
    { ...said("It is real.", "The Traces agree."), actions: [action] },
    true,
  );
  const answered = await ask("Is it real?", connected);
  expect(answered).toMatchObject({
    reply: "It is real.",
    reasoning: "The Traces agree.",
    actions: [action],
  });
  // reasoning streams before any words of the reply, and chips come only with the whole answer
  const first = answered.seen[0]?.messages[0];
  expect(first?.role === "assistant" && first.content.map(({ type }) => type)).toEqual([
    "thinking",
  ]);
  expect(answered.seen.slice(0, -1).every(({ actions }) => actions.length === 0)).toBe(true);
  expect(fetched).not.toHaveBeenCalled();
  expect((await ask("Is it real?", connected)).reply).toBe("Live.");
});

test("a recording waits for its own question on its own Issue", async () => {
  live(liveReply);
  recordAnswer("Is it real?", ISSUE, said("Recorded."), true);
  expect((await ask("Something else?", connected)).reply).toBe("Live.");
  const elsewhere = `The engineer is viewing Issue ${ISSUE}0.`;
  expect((await ask("Is it real?", connected, elsewhere)).reply).toBe("Live.");
});

test("without only, a connected Pebble answers a scripted question live and a refusal plays the recording", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 200 });
  live(liveReply);
  recordAnswer("Is it real?", ISSUE, said("Recorded."));
  expect((await ask("Is it real?", connected)).reply).toBe("Live.");

  live(refusing);
  recordAnswer("Is it real?", ISSUE, said("Recorded."));
  expect((await ask("Is it real?", connected)).reply).toBe("Recorded.");
});

test("Stop ends a recorded answer and leaves no timer running", async () => {
  vi.useFakeTimers();
  recordAnswer("Stop this answer", ISSUE, said("first second third"), true);
  const asked = new AbortController();
  const answers = pebbleAnswer(question("Stop this answer"), asked.signal, disconnected);
  const first = await answers.next();
  expect(first.done).toBe(false);
  asked.abort();
  const rest = await read({ [Symbol.asyncIterator]: () => answers });
  expect(rest.seen.length).toBeLessThanOrEqual(1);
  expect(vi.getTimerCount()).toBe(0);
});

test("a suggested prompt plays its prepared answer on the screen that names the most of its words, never live", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 200 });
  const { fetched } = live(liveReply);
  const answers: PreparedAnswer[] = [
    { prompt: "Summarize this Issue", on: [], answer: said("Every Issue.") },
    { prompt: "Summarize this Issue", on: [ISSUE], answer: said("This Issue.") },
    { prompt: "Summarize this Issue", on: [`${ISSUE}0`], answer: said("Another Issue.") },
  ];
  const prepared = async (request: PebbleRequest) => preparedAnswer(answers, request);
  const answered = (text: string, context = SCREEN) =>
    read(pebbleAnswer(question(text, context), new AbortController().signal, connected, prepared));
  expect((await answered("summarize  this issue?")).reply).toBe("This Issue.");
  // a record the context only lists below the screen picks nothing
  const listed = `<screen agent="a">\nThe engineer is viewing Overview.\n</screen>\n<issue id="${ISSUE}0">`;
  expect((await answered("Summarize this Issue", listed)).reply).toBe("Every Issue.");
  expect(fetched).not.toHaveBeenCalled();
  expect((await answered("Something else?")).reply).toBe("Live.");

  recordAnswer("Summarize this Issue", ISSUE, said("Recorded."), true);
  expect((await answered("Summarize this Issue")).reply).toBe("Recorded.");
});

test("a question's Agent is the one its screen line names", () => {
  expect(
    screenAgent(`<screen agent="unity-ai" repository="/workspace/unity-ai">\nOverview\n</screen>`),
  ).toBe("unity-ai");
  expect(screenAgent("The engineer is viewing Overview.")).toBeUndefined();
});
