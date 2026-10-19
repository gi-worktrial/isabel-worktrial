import { applyImmutable, type Op } from "@earendil-works/chord/delta";
import type { ConversationView, EntryRecord } from "@earendil-works/pi-durable";
import { afterEach, expect, test, vi } from "vitest";

import { CONTEXT_ENTRY, chatView, messageText } from "#/lib/pebble/view";
import { ACTIONS_ENTRY, READ_ENTRY } from "#src/pebble/wire";
import { threadEventSchema } from "#src/sdk/index";
import { ISSUE, tinyClient } from "#test/tiny-seed";

import { clearAnswer, OFFLINE_REPLY, recordAnswer } from "./answers.ts";

type Frame = { type: string; [field: string]: unknown };

// a thread's socket as `useAgent` drives it: RPC frames out, identity, state, views and events back
async function open() {
  vi.stubGlobal(
    "fetch",
    vi.fn<() => Promise<Response>>(async () => Response.json({ connected: false })),
  );
  const { client } = tinyClient();
  const thread = await client.pebble.threads.create({ repos: ["tiny"] });
  const {
    WebSocket: Socket,
    basePath,
    host,
  } = await client.pebble.threads.connectionOptions(thread.id);
  if (Socket === undefined) {
    throw new Error("The demo serves no socket");
  }
  const socket = new Socket(`ws://${host}/${basePath}`);
  const frames: Frame[] = [];
  const views: Record<string, ConversationView> = {};
  socket.addEventListener("message", (event) => {
    const frame = JSON.parse(String(event.data)) as Frame;
    frames.push(frame);
    if (frame.type === "session.view") {
      const session = String(frame.session);
      views[session] = applyImmutable(views[session], frame.ops as Op[]);
    }
  });
  await vi.waitFor(() => expect(frames.map(({ type }) => type)).toContain("cf_agent_identity"));
  let id = 0;
  async function call(method: string, ...args: unknown[]) {
    id += 1;
    const asked = String(id);
    socket.send(JSON.stringify({ type: "rpc", id: asked, method, args }));
    const reply = await vi.waitFor(() => {
      const found = frames.find((frame) => frame.type === "rpc" && frame.id === asked);
      expect(found).toBeDefined();
      return found;
    });
    if (reply?.success !== true) {
      throw new Error(String(reply?.error));
    }
    return reply.result;
  }
  const settled = () =>
    vi.waitFor(() => expect(frames.some(({ type }) => type === "operation.settled")).toBe(true));
  return { client, thread, socket, frames, views, call, settled };
}

const entriesOf = async (
  call: (method: string, ...args: unknown[]) => Promise<unknown>,
  session = "1",
) => ((await call("entries", { session, order: "ascending" })) as { items: EntryRecord[] }).items;

afterEach(() => {
  clearAnswer();
  vi.unstubAllGlobals();
});

test("a question writes the screen, the records it read and the question, then Pebble's reply, and names the chat", async () => {
  const { client, frames, views, call, settled } = await open();
  expect(frames.find(({ type }) => type === "cf_agent_state")).toEqual({
    type: "cf_agent_state",
    state: { sandbox: { status: "ready" } },
  });
  expect(await call("sessions")).toEqual([{ id: "1", busy: false }]);
  await call("watch", "1");
  const note = { agent: "tiny", read: [], mentions: [] };
  await call(
    "submit",
    {
      type: "write",
      visible: true,
      operationId: "a",
      entry: { kind: CONTEXT_ENTRY, data: "Screen" },
    },
    { session: "1" },
  );
  await call(
    "submit",
    { type: "write", operationId: "b", entry: { kind: READ_ENTRY, data: note } },
    { session: "1" },
  );
  await call(
    "submit",
    {
      type: "input",
      operationId: "c",
      content: "Why does @[GRD-1] refund twice?\nIt shows twice.",
    },
    { session: "1" },
  );
  await settled();

  const entries = await entriesOf(call);
  expect(entries.map(({ kind }) => kind)).toEqual([
    CONTEXT_ENTRY,
    READ_ENTRY,
    "pi.user",
    "pi.assistant",
  ]);
  expect(entries.map(({ model = [] }) => model.map(messageText).join(""))).toEqual([
    "Screen",
    "",
    "Why does @[GRD-1] refund twice?\nIt shows twice.",
    OFFLINE_REPLY,
  ]);
  expect(chatView(views["1"]).entries.map(({ kind }) => kind)).toEqual(
    entries.map(({ kind }) => kind),
  );
  expect(chatView(views["1"]).busy).toBe(false);
  // the web drops an event platform's schema refuses, so each one the socket sends must parse
  const events = frames.filter(({ type }) => type === "thread.updated" || type === "session.view");
  expect(events.every((frame) => threadEventSchema.safeParse(frame).success)).toBe(true);
  expect(frames.find(({ type }) => type === "thread.updated")).toMatchObject({
    thread: { title: "Why does GRD-1 refund twice?" },
  });
  expect((await client.pebble.threads.list()).threads.map(({ title }) => title)).toEqual([
    "Why does GRD-1 refund twice?",
  ]);
});

test("a recording on its Issue streams as the live partial, then its reply and chips are entries", async () => {
  const { views, call, settled } = await open();
  const action = { kind: "open", ref: { record: "issue", issue: ISSUE } } as const;
  recordAnswer(
    "Is it real?",
    ISSUE,
    {
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "The Traces agree." },
            { type: "text", text: "It is real." },
          ],
        },
      ],
      actions: [action],
    },
    true,
  );
  await call("watch", "1");
  await call(
    "submit",
    {
      type: "write",
      visible: true,
      operationId: "a",
      entry: { kind: CONTEXT_ENTRY, data: `Issue ${ISSUE}` },
    },
    { session: "1" },
  );
  await call(
    "submit",
    { type: "input", operationId: "b", content: "Is it real?" },
    { session: "1" },
  );
  await vi.waitFor(() => expect(chatView(views["1"]).partial).toBeDefined());
  expect(chatView(views["1"]).busy).toBe(true);
  await settled();

  const entries = await entriesOf(call);
  expect(entries.map(({ kind }) => kind)).toEqual([
    CONTEXT_ENTRY,
    "pi.user",
    "pi.assistant",
    ACTIONS_ENTRY,
  ]);
  expect(entries[2]?.model?.[0]).toMatchObject({
    role: "assistant",
    stopReason: "stop",
    content: [
      { type: "thinking", thinking: "The Traces agree." },
      { type: "text", text: "It is real." },
    ],
  });
  expect(entries[3]?.data).toEqual([action]);
  expect(chatView(views["1"]).partial).toBeUndefined();
});

test("abort ends a running answer as stopped, and a fork keeps the entries up to its point", async () => {
  const { call, settled } = await open();
  recordAnswer(
    "Stop here",
    ISSUE,
    {
      messages: [
        { role: "assistant", content: [{ type: "text", text: "one two three four five six" }] },
      ],
      actions: [],
    },
    true,
  );
  await call(
    "submit",
    { type: "write", visible: true, operationId: "a", entry: { kind: CONTEXT_ENTRY, data: ISSUE } },
    { session: "1" },
  );
  await call("submit", { type: "input", operationId: "b", content: "Stop here" }, { session: "1" });
  expect(await call("abort", { session: "1" })).toBe(true);
  await settled();
  const entries = await entriesOf(call);
  expect(entries.at(-1)?.model?.[0]).toMatchObject({ role: "assistant", stopReason: "aborted" });

  const fork = await call("fork", { session: "1", at: entries[0]?.id });
  expect(fork).toBe("2");
  expect((await entriesOf(call, "2")).map(({ kind }) => kind)).toEqual([CONTEXT_ENTRY]);
  expect(await call("sessions")).toEqual([
    { id: "1", busy: false },
    { id: "2", parent: "1", busy: false },
  ]);
});
