// platform's Pebble thread socket served in the browser: each thread's Pi sessions kept in the viewer's layer, the
// agents RPC frames `useAgent` speaks, and answers (a recording, a prepared answer, the Worker or the offline reply)
// streamed as Pi's live partial, then written as entries
import { diffRevisions, type JsonValue, type Op } from "@earendil-works/chord/delta";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import type { EntryRecord } from "@earendil-works/pi-durable";
import type { PiSessionInfo } from "agents/harness/pi";

import { CONTEXT_ENTRY, messageText } from "#/lib/pebble/view";
import { ACTIONS_ENTRY, type PebbleAnswer, type PebbleRequest } from "#src/pebble/wire";
import type { ThreadConnection } from "#src/queries/client";
import {
  abortOptionsSchema,
  entriesOptionsSchema,
  forkOptionsSchema,
  GroundedError,
  PI_ROOT_SESSION,
  type SandboxStatus,
  sessionIdSchema,
  setModelOptionsSchema,
  submissionSchema,
  submitOptionsSchema,
  type Thread,
  type ThreadEvent,
} from "#src/sdk/index";

import { pebbleAnswer } from "./answers.ts";

/** One Pi session of a thread as the layer keeps it: a fork names its parent and copies the entries it inherits. */
export type SessionRecord = { parent: string | null; entries: EntryRecord[]; model: string | null };

/** What a thread's socket reads and writes in its Agent's plane. */
export type ThreadHost = {
  /** The thread's sessions, looked up on every call since a Walkthrough's restore replaces the records. */
  sessions(thread: string): Record<string, SessionRecord> | undefined;
  /** Saves a change to the thread's sessions in the layer. */
  write(thread: string, change: (sessions: Record<string, SessionRecord>) => void): Promise<void>;
  /** A question was asked: the thread takes its title and moves up the list. */
  asked(thread: string, question: string): Promise<Thread>;
  /** Whether the chat's sandbox is still awake from its last prompt. */
  awake(thread: string): boolean;
  connected(): Promise<boolean>;
  /** The answer demo-data composed for a suggested prompt on this screen, if any. */
  prepared(request: PebbleRequest): Promise<PebbleAnswer | undefined>;
  now(): number;
};

const SOCKET_HOST = "pebble.demo";
// a sandbox wakes this long after a prompt or a keystroke asks for it
const WAKE_MS = 1200;
const NO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const EMPTY: SessionRecord = { parent: null, entries: [], model: null };

type Rpc = { type: "rpc"; id: string; method: string; args: unknown[] };
// what the thread's runs tell each open socket
type Socket = {
  readonly watched: Set<string>;
  view(session: string, next: JsonValue): void;
  state(status: SandboxStatus): void;
  event(event: ThreadEvent): void;
};
type Run = { message: AssistantMessage | undefined; stop: AbortController };
type Ending = { stopReason: AssistantMessage["stopReason"]; error?: string | undefined };
// one thread's live state in this page: its open sockets, running answers and sandbox
type Live = {
  sockets: Set<Socket>;
  runs: Map<string, Run>;
  sandbox: SandboxStatus;
  waking: Promise<void> | undefined;
  // ids only grow within a page, so a restored layer never hands an old id to a new entry or session
  entry: number;
  session: number;
};

// SAFETY: Pi's ids are numbers branded by kind, and the demo numbers its entries and sessions itself
const entryId = (id: number) => id as EntryRecord["id"];
// SAFETY: as above, a session's conversation is its number
const conversationId = (session: string) => Number(session) as EntryRecord["conversationId"];
// SAFETY: views hold only stored entries and parsed answers, which are JSON
const json = (value: object) => value as JsonValue;

// the turns the engineer saw, so a stopped or failed answer is left out, and the newest screen the chat was told
function request(entries: readonly EntryRecord[]): PebbleRequest {
  const context = entries.findLast(({ kind }) => kind === CONTEXT_ENTRY)?.data;
  const messages = entries.flatMap(({ kind, model = [] }) =>
    kind === "pi.user" || kind === "pi.assistant"
      ? model.flatMap((message) => {
          const text = messageText(message);
          return (message.role === "user" || message.role === "assistant") && text !== ""
            ? [{ role: message.role, text }]
            : [];
        })
      : [],
  );
  return { context: typeof context === "string" ? context : "", messages };
}

/**
 * The socket class a thread's connection options carry, so platform's own `useAgent` and session code run against
 * the demo's threads.
 */
export function threadSockets(host: ThreadHost) {
  const threads = new Map<string, Live>();

  function liveOf(thread: string): Live {
    const known = threads.get(thread);
    if (known !== undefined) {
      return known;
    }
    const sessions = Object.entries(host.sessions(thread) ?? {});
    const created: Live = {
      sockets: new Set(),
      runs: new Map(),
      sandbox: host.awake(thread) ? "ready" : "stopped",
      waking: undefined,
      entry: 1 + Math.max(0, ...sessions.flatMap(([, { entries }]) => entries.map(({ id }) => id))),
      session: 1 + Math.max(Number(PI_ROOT_SESSION), ...sessions.map(([id]) => Number(id))),
    };
    threads.set(thread, created);
    return created;
  }

  function sessionOf(thread: string, session: string): SessionRecord {
    const sessions = host.sessions(thread);
    if (sessions === undefined) {
      throw new GroundedError(`No Pebble thread ${thread}`, 404, undefined);
    }
    const found = sessions[session] ?? (session === PI_ROOT_SESSION ? EMPTY : undefined);
    if (found === undefined) {
      throw new GroundedError(`No session ${session} in thread ${thread}`, 404, undefined);
    }
    return found;
  }

  function viewOf(thread: string, session: string): JsonValue {
    const { entries, model } = sessionOf(thread, session);
    const run = liveOf(thread).runs.get(session);
    // a copy, since the stored list grows in place and each view is diffed against the one sent before
    return json({
      conversation: { id: conversationId(session) },
      entries: [...entries],
      docs: {
        "pi.agent": model === null ? {} : { model: { provider: "grounded", modelId: model } },
        "pi.live":
          run === undefined
            ? {}
            : {
                run: { taskId: 1, inputs: [] },
                ...(run.message === undefined
                  ? {}
                  : { generation: { attempt: 1, message: run.message } }),
              },
      },
    });
  }

  const watching = (thread: string, session: string) =>
    [...liveOf(thread).sockets].filter((socket) => socket.watched.has(session));

  function changed(thread: string, session: string) {
    for (const socket of watching(thread, session)) {
      socket.view(session, viewOf(thread, session));
    }
  }

  function sandbox(thread: string, status: SandboxStatus) {
    const live = liveOf(thread);
    live.sandbox = status;
    for (const socket of live.sockets) {
      socket.state(status);
    }
  }

  function wake(thread: string): Promise<void> {
    const live = liveOf(thread);
    if (live.sandbox === "ready") {
      return Promise.resolve();
    }
    live.waking ??= new Promise<void>((resolve) => {
      sandbox(thread, "starting");
      setTimeout(() => {
        live.waking = undefined;
        sandbox(thread, "ready");
        resolve();
      }, WAKE_MS);
    });
    return live.waking;
  }

  async function append(
    thread: string,
    session: string,
    entry: Omit<EntryRecord, "id" | "conversationId">,
  ) {
    const live = liveOf(thread);
    const record: EntryRecord = {
      id: entryId(live.entry),
      conversationId: conversationId(session),
      ...entry,
    };
    live.entry += 1;
    await host.write(thread, (sessions) => {
      sessions[session] ??= { ...EMPTY, entries: [] };
      sessions[session].entries.push(record);
    });
    changed(thread, session);
    return record;
  }

  function assistant(
    thread: string,
    session: string,
    content: AssistantMessage["content"],
    stopReason: AssistantMessage["stopReason"],
    errorMessage?: string | undefined,
  ): AssistantMessage {
    return {
      role: "assistant",
      content,
      api: "openai-responses",
      provider: "grounded",
      model: sessionOf(thread, session).model ?? "pebble",
      usage: NO_USAGE,
      stopReason,
      ...(errorMessage === undefined ? {} : { errorMessage }),
      timestamp: host.now(),
    };
  }

  async function answer(thread: string, session: string, operationId: string) {
    const live = liveOf(thread);
    const run: Run = { message: undefined, stop: new AbortController() };
    live.runs.set(session, run);
    changed(thread, session);
    let last: PebbleAnswer | undefined;
    let written = 0;
    // finished messages go in as entries in order, the last one ending the answer as `end` says
    const write = async (upTo: number, end?: Ending) => {
      for (const from of last?.messages.slice(written, upTo) ?? []) {
        written += 1;
        const ends = end !== undefined && written === upTo;
        await append(thread, session, {
          kind: from.role === "assistant" ? "pi.assistant" : "pi.tool-result",
          model: [
            from.role === "assistant"
              ? assistant(
                  thread,
                  session,
                  from.content,
                  ends ? end.stopReason : "toolUse",
                  ends ? end.error : undefined,
                )
              : { ...from, timestamp: host.now() },
          ],
        });
      }
    };
    let end: Ending = { stopReason: "stop" };
    try {
      await wake(thread);
      const asked = request(sessionOf(thread, session).entries);
      for await (const next of pebbleAnswer(
        asked,
        run.stop.signal,
        host.connected,
        host.prepared,
      )) {
        last = next;
        const partial = next.messages.at(-1);
        await write(next.messages.length - (partial?.role === "assistant" ? 1 : 0));
        run.message =
          partial?.role === "assistant"
            ? assistant(thread, session, partial.content, "pending")
            : undefined;
        changed(thread, session);
      }
      if (run.stop.signal.aborted) {
        end = { stopReason: "aborted" };
      }
    } catch (error) {
      end = run.stop.signal.aborted
        ? { stopReason: "aborted" }
        : { stopReason: "error", error: error instanceof Error ? error.message : String(error) };
    }
    run.message = undefined;
    const messages = last?.messages ?? [];
    const reply = messages.at(-1);
    if (reply?.role === "assistant") {
      await write(messages.length, end);
    } else if (end.stopReason !== "stop") {
      // an answer cut short before its words still ends the turn, with why
      await append(thread, session, {
        kind: "pi.assistant",
        model: [assistant(thread, session, [], end.stopReason, end.error)],
      });
    }
    if (end.stopReason === "stop" && last !== undefined && last.actions.length > 0) {
      await append(thread, session, { kind: ACTIONS_ENTRY, data: last.actions });
    }
    live.runs.delete(session);
    changed(thread, session);
    const text =
      reply?.role === "assistant"
        ? reply.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
        : undefined;
    for (const socket of watching(thread, session)) {
      socket.event({
        type: "operation.settled",
        session,
        result: { operationId, session, status: "done", ...(text === undefined ? {} : { text }) },
      });
    }
  }

  // each RPC the web's session code calls, checked with platform's own schemas
  async function call(
    socket: Socket & { thread: string },
    { method, args }: Rpc,
  ): Promise<unknown> {
    const { thread } = socket;
    const live = liveOf(thread);
    switch (method) {
      case "sessions": {
        const sessions = host.sessions(thread);
        if (sessions === undefined) {
          throw new GroundedError(`No Pebble thread ${thread}`, 404, undefined);
        }
        const ids = new Set([PI_ROOT_SESSION, ...Object.keys(sessions)]);
        return [...ids].map((id): PiSessionInfo => ({
          id,
          ...(sessions[id]?.parent ? { parent: sessions[id].parent } : {}),
          busy: live.runs.has(id),
        }));
      }
      case "watch": {
        const session = sessionIdSchema.parse(args[0]);
        socket.watched.add(session);
        socket.view(session, viewOf(thread, session));
        return null;
      }
      case "unwatch":
        socket.watched.delete(sessionIdSchema.parse(args[0]));
        return null;
      case "entries": {
        const {
          session,
          order = "descending",
          minEntryId = 0,
          maxEntryId = Infinity,
          cursor,
          limit,
        } = entriesOptionsSchema.parse(args[0] ?? {});
        const after = typeof cursor?.after === "number" ? cursor.after : undefined;
        const ordered = sessionOf(thread, session)
          .entries.filter(({ id }) => id >= minEntryId && id <= maxEntryId)
          .toSorted((left, right) =>
            order === "ascending" ? left.id - right.id : right.id - left.id,
          );
        const from = after === undefined ? 0 : ordered.findIndex(({ id }) => id === after) + 1;
        const items = ordered.slice(from, from + limit);
        const more = from + limit < ordered.length;
        return { items, ...(more ? { next: { after: items.at(-1)?.id ?? 0 } } : {}) };
      }
      case "submit": {
        const submission = submissionSchema.parse(args[0]);
        const { session } = submitOptionsSchema.parse(args[1]);
        sessionOf(thread, session);
        if (submission.type === "write") {
          const visible = "visible" in submission && submission.visible === true;
          await append(thread, session, {
            kind: submission.entry.kind,
            data: submission.entry.data,
            ...(visible
              ? {
                  model: [
                    { role: "user", content: String(submission.entry.data), timestamp: host.now() },
                  ],
                }
              : {}),
          });
        } else {
          if (live.runs.has(session)) {
            throw new GroundedError("Pebble is still answering in this chat", 409, undefined);
          }
          await append(thread, session, {
            kind: "pi.user",
            model: [{ role: "user", content: submission.content, timestamp: host.now() }],
          });
          const updated = await host.asked(thread, submission.content);
          for (const each of live.sockets) {
            each.event({ type: "thread.updated", thread: updated });
          }
          void answer(thread, session, submission.operationId);
        }
        return { operationId: submission.operationId, session, accepted: true };
      }
      case "abort": {
        const { session } = abortOptionsSchema.parse(args[0]);
        const run = live.runs.get(session);
        run?.stop.abort();
        return run !== undefined;
      }
      case "createSession":
      case "fork": {
        const { session, at } =
          method === "fork"
            ? forkOptionsSchema.parse(args[0])
            : { session: undefined, at: undefined };
        const parent = session === undefined ? undefined : sessionOf(thread, session);
        const id = String(live.session);
        live.session += 1;
        await host.write(thread, (sessions) => {
          sessions[id] = {
            parent: session ?? null,
            entries: (parent?.entries ?? []).filter((entry) => at === undefined || entry.id <= at),
            model: parent?.model ?? sessions[PI_ROOT_SESSION]?.model ?? null,
          };
        });
        return id;
      }
      case "setModel": {
        const model = String(args[0]);
        const { session } = setModelOptionsSchema.parse(args[1]);
        await host.write(thread, (sessions) => {
          sessions[session] = { ...(sessions[session] ?? EMPTY), model };
        });
        changed(thread, session);
        return null;
      }
      case "startSandbox":
        await wake(thread);
        return null;
      default:
        throw new GroundedError(`The demo's Pebble has no ${method}`, 501, undefined);
    }
  }

  /** A thread's socket: a WebSocket that answers in the page instead of over the network. */
  class DemoThreadSocket extends EventTarget implements WebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;
    binaryType: BinaryType = "blob";
    readonly bufferedAmount = 0;
    readonly extensions = "";
    readonly protocol = "";
    readyState: WebSocket["readyState"] = DemoThreadSocket.CONNECTING;
    readonly url: string;
    onclose: ((this: WebSocket, event: CloseEvent) => unknown) | null = null;
    onerror: ((this: WebSocket, event: Event) => unknown) | null = null;
    onmessage: ((this: WebSocket, event: MessageEvent) => unknown) | null = null;
    onopen: ((this: WebSocket, event: Event) => unknown) | null = null;
    readonly thread: string;
    // every connection watches the root, and `watch` adds the others
    readonly watched = new Set([PI_ROOT_SESSION]);
    // the view each watched session last sent, which the next one is a diff of
    readonly #sent = new Map<string, JsonValue>();

    constructor(url: string | URL) {
      super();
      this.url = String(url);
      this.thread = new URL(this.url).pathname.split("/").at(-1) ?? "";
      setTimeout(() => this.#open());
    }

    #open() {
      if (this.readyState !== DemoThreadSocket.CONNECTING) {
        return;
      }
      this.readyState = DemoThreadSocket.OPEN;
      const live = liveOf(this.thread);
      live.sockets.add(this);
      this.dispatchEvent(new Event("open"));
      this.state(live.sandbox);
      this.#send({ type: "cf_agent_identity", name: this.thread, agent: "pebble" });
      try {
        this.view(PI_ROOT_SESSION, viewOf(this.thread, PI_ROOT_SESSION));
      } catch {
        // a thread a restore removed has no root to show, and its calls say so
      }
    }

    #send(frame: object) {
      const data = JSON.stringify(frame);
      setTimeout(() => {
        if (this.readyState === DemoThreadSocket.OPEN) {
          this.dispatchEvent(new MessageEvent("message", { data }));
        }
      });
    }

    state(status: SandboxStatus) {
      this.#send({ type: "cf_agent_state", state: { sandbox: { status } } });
    }

    event(event: ThreadEvent) {
      this.#send(event);
    }

    view(session: string, next: JsonValue) {
      const before = this.#sent.get(session);
      const ops: Op[] = before === undefined ? [["r", next]] : diffRevisions(before, next);
      this.#sent.set(session, next);
      if (ops.length > 0) {
        this.#send({ type: "session.view", session, ops });
      }
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      const frame = typeof data === "string" ? (JSON.parse(data) as Partial<Rpc>) : {};
      if (frame.type !== "rpc" || frame.id === undefined || frame.method === undefined) {
        return;
      }
      const rpc: Rpc = { type: "rpc", id: frame.id, method: frame.method, args: frame.args ?? [] };
      call(this, rpc).then(
        (result) => this.#send({ type: "rpc", id: rpc.id, success: true, result, done: true }),
        (error: unknown) =>
          this.#send({
            type: "rpc",
            id: rpc.id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }),
      );
    }

    close(code = 1000, reason = "") {
      if (this.readyState === DemoThreadSocket.CLOSED) {
        return;
      }
      this.readyState = DemoThreadSocket.CLOSED;
      liveOf(this.thread).sockets.delete(this);
      this.dispatchEvent(new CloseEvent("close", { code, reason, wasClean: true }));
    }
  }

  return (thread: string): ThreadConnection => ({
    agent: "pebble",
    host: SOCKET_HOST,
    protocol: "ws",
    basePath: `pebble/${thread}`,
    protocols: async () => [],
    WebSocket: DemoThreadSocket,
  });
}
