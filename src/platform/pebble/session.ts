import { applyImmutable } from "@earendil-works/chord/delta";
import type { ConversationView, Cursor, EntryId, EntryRecord } from "@earendil-works/pi-durable";
import {
  PI_ROOT_SESSION,
  threadEventSchema,
  threadStateSchema,
  type SandboxStatus,
  type Thread,
  type ThreadCallables,
  type ThreadConnectionOptions,
  type ThreadEvent,
  type ThinkingLevel,
} from "@grounded-intelligence/grounded-sdk";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryFunctionContext,
} from "@tanstack/react-query";
import type { PiSessionInfo } from "agents/harness/pi";
import { useAgent } from "agents/react";
import { useEffect, useReducer, useRef } from "react";

import {
  CONTEXT_ENTRY,
  chatView,
  contextChanged,
  mergeEntries,
  messageText,
} from "#/lib/pebble/view";
import { DONE_ENTRY, READ_ENTRY, type DoneNote, type Question, type ReadNote } from "#src/pebble/wire";

type Request = { status: "idle" } | { status: "pending" } | { status: "failed"; error: string };

type SessionState = {
  session: string | undefined;
  views: Record<string, ConversationView>;
  unanswered: Record<string, string>;
  entries: Record<string, readonly EntryRecord[]>;
  request: Request;
  sandbox: SandboxStatus | undefined;
};

type SessionAction =
  | { type: "opened"; session: string }
  | { type: "event"; event: ThreadEvent }
  | { type: "asked"; session: string }
  | { type: "request"; request: Request }
  | { type: "sandbox"; status: SandboxStatus };

function reduce(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "opened":
      return { ...state, session: action.session };
    case "asked": {
      const { [action.session]: _, ...unanswered } = state.unanswered;
      return { ...state, unanswered };
    }
    case "request":
      return { ...state, request: action.request };
    case "sandbox":
      return { ...state, sandbox: action.status };
    case "event": {
      const { event } = action;
      if (event.type === "session.view") {
        const views = {
          ...state.views,
          [event.session]: applyImmutable(state.views[event.session], event.ops),
        };
        const view = views[event.session];
        if (view?.entries === state.views[event.session]?.entries) {
          return { ...state, views };
        }

        return {
          ...state,
          views,
          entries: {
            ...state.entries,
            [event.session]: mergeEntries(state.entries[event.session] ?? [], view?.entries ?? []),
          },
        };
      }
      if (event.type !== "operation.settled" || event.result.status !== "unanswered") {
        return state;
      }
      const reason = event.result.reason ?? "Pebble stopped without an answer.";
      return { ...state, unanswered: { ...state.unanswered, [event.session]: reason } };
    }
  }
}

const ASLEEP: ReadonlySet<SandboxStatus> = new Set(["unknown", "stopped", "pausing", "error"]);

const byNewest = (left: PiSessionInfo, right: PiSessionInfo) => Number(right.id) - Number(left.id);

/**
 * One thread's newest Pi session over the thread socket.
 * `context` is written ahead of a question whenever it differs from the session's last one.
 */
export function useSession(
  connection: ThreadConnectionOptions,
  context: string,
  onThreadUpdated: (thread: Thread) => void,
) {
  const [state, dispatch] = useReducer(reduce, {
    session: undefined,
    views: {},
    unanswered: {},
    entries: {},
    request: { status: "idle" },
    sandbox: undefined,
  });
  // The socket's callbacks outlive a render, so they read the open session from here.
  const opened = useRef<string>(undefined);
  const agent = useAgent<ThreadCallables, unknown>({
    ...connection,
    // A reconnected socket watches only the root, so watch the open session again.
    onIdentity: () => {
      agent
        .call("sessions")
        .then(async (all) => {
          const session = opened.current ?? [...all].sort(byNewest)[0]?.id ?? PI_ROOT_SESSION;
          if (session !== PI_ROOT_SESSION) {
            await agent.call("watch", [session]);
          }
          opened.current = session;
          dispatch({ type: "opened", session });
        })
        .catch((error: Error) =>
          dispatch({ type: "request", request: { status: "failed", error: error.message } }),
        );
    },
    onStateUpdate: (update) => {
      const parsed = threadStateSchema.safeParse(update);
      if (parsed.success) {
        dispatch({ type: "sandbox", status: parsed.data.sandbox.status });
      }
    },
    onMessage: (message) => {
      const event = threadEventSchema.safeParse(JSON.parse(String(message.data)));
      if (event.success) {
        if (event.data.type === "thread.updated") {
          onThreadUpdated(event.data.thread);
        }
        dispatch({ type: "event", event: event.data });
      }
    },
  });
  const { session, request } = state;
  const activeView = session === undefined ? undefined : state.views[session];
  // Pi replaces the conversation record on attachment, but retains it across live updates.
  const attachment = activeView?.conversation;
  const contextHead = activeView?.entries.find(({ head }) => head !== undefined)?.id;
  const view = chatView(activeView);
  const ready = agent.identified && session !== undefined;
  const queryClient = useQueryClient();
  const historyKey = [
    "pebble-history",
    connection.host,
    connection.basePath,
    connection.agent,
    session,
  ];
  const history = useInfiniteQuery({
    queryKey: historyKey,
    queryFn: async ({
      pageParam,
      signal,
    }: QueryFunctionContext<typeof historyKey, Cursor | undefined>) => {
      const page = await agent.call("entries", [{ session, cursor: pageParam }]);
      signal.throwIfAborted();
      return page;
    },
    initialPageParam: undefined,
    getNextPageParam: (page): Cursor | undefined => page.next,
    enabled: ready && attachment !== undefined,
    staleTime: Infinity,
  });
  const syncKey = [...historyKey, "sync"];
  const sync = useQuery({
    queryKey: syncKey,
    queryFn: async ({ signal }) => {
      const previous = queryClient.getQueryData<EntryRecord[]>(syncKey) ?? [];
      const newest = previous[0] ?? history.data?.pages[0]?.items[0];
      const minEntryId = (newest?.id ?? 0) + 1;
      const fetched: EntryRecord[] = [];
      let cursor: Cursor | undefined;
      do {
        const page = await agent.call("entries", [{ session, minEntryId, cursor }]);
        signal.throwIfAborted();
        fetched.push(...page.items);
        cursor = page.next;
      } while (cursor !== undefined);

      return mergeEntries(previous, fetched).reverse();
    },
    // Cached data lets a reconnect cancel even the first in-flight sync.
    initialData: (): EntryRecord[] => [],
    enabled: false,
  });
  const historyReady = history.data !== undefined;
  const { refetch: synchronize } = sync;
  useEffect(() => {
    if (ready && attachment !== undefined && historyReady) {
      void synchronize();
    }
  }, [ready, attachment, contextHead, historyReady, synchronize]);

  const oldest = history.data?.pages.at(-1)?.items.at(-1)?.id ?? 0;
  const live = session === undefined ? [] : (state.entries[session] ?? []);
  const entries = historyReady
    ? mergeEntries(
        history.data.pages.flatMap(({ items }) => items),
        [...sync.data, ...live.filter(({ id }) => id >= oldest)],
      )
    : [];

  /** Runs a request, showing its error, and resolves whether it succeeded. */
  function run(call: () => Promise<void>) {
    dispatch({ type: "request", request: { status: "pending" } });
    return call().then(
      () => {
        dispatch({ type: "request", request: { status: "idle" } });
        return true;
      },
      (error: Error) => {
        dispatch({ type: "request", request: { status: "failed", error: error.message } });
        return false;
      },
    );
  }

  async function open(next: string) {
    const previous = opened.current;
    if (previous !== undefined && previous !== PI_ROOT_SESSION && previous !== next) {
      await agent.call("unwatch", [previous]);
    }
    if (next !== PI_ROOT_SESSION) {
      await agent.call("watch", [next]);
    }
    opened.current = next;
    dispatch({ type: "opened", session: next });
  }

  async function submit(target: string, text: string, question?: Question) {
    dispatch({ type: "asked", session: target });
    const written = question?.context ?? context;
    if (contextChanged(chatView(state.views[target]), written)) {
      await agent.call("submit", [
        {
          type: "write",
          visible: true,
          operationId: crypto.randomUUID(),
          entry: { kind: CONTEXT_ENTRY, data: written },
        },
        { session: target },
      ]);
    }
    if (question !== undefined) {
      await write(target, READ_ENTRY, question.note);
    }
    await agent.call("submit", [
      { type: "input", operationId: crypto.randomUUID(), content: text },
      { session: target },
    ]);
  }

  // Grounded's own entries, which Pebble's model never reads
  async function write(target: string, kind: string, data: ReadNote | DoneNote) {
    await agent.call("submit", [
      { type: "write", operationId: crypto.randomUUID(), entry: { kind, data } },
      { session: target },
    ]);
  }

  return {
    session,
    view,
    entries,
    hasEarlier: history.hasNextPage,
    loadingHistory: history.isFetchingNextPage,
    historyError: history.isFetchNextPageError ? history.error?.message : undefined,
    async loadEarlier() {
      if (history.hasNextPage && !history.isFetching) {
        await history.fetchNextPage();
      }
    },
    loading: session === undefined ? request.status !== "failed" : history.isPending,
    syncError:
      (!history.isFetchNextPageError ? history.error?.message : undefined) ?? sync.error?.message,
    retrySync: () => void (historyReady ? sync.refetch() : history.refetch()),
    ready,
    pending: request.status === "pending",
    error:
      (request.status === "failed" ? request.error : undefined) ??
      (session === undefined ? undefined : state.unanswered[session]) ??
      view.error,
    asked: entries.some(({ kind }) => kind === "pi.user" || kind === "pi.compaction"),
    sandbox: state.sandbox,

    /** Starts the sandbox while the engineer types, so it's ready when they send. */
    wake() {
      if (state.sandbox === undefined || !ASLEEP.has(state.sandbox)) {
        return;
      }

      dispatch({ type: "sandbox", status: "starting" });
      agent.call("startSandbox", [], { timeout: 0 }).catch((error: Error) => {
        // A dropped socket rejects its calls, and the reconnected socket resends the sandbox state.
        if (agent.readyState !== WebSocket.OPEN) {
          return;
        }

        dispatch({ type: "sandbox", status: "error" });
        dispatch({ type: "request", request: { status: "failed", error: error.message } });
      });
    },

    ask: (text: string, question?: Question) =>
      session === undefined ? Promise.resolve(false) : run(() => submit(session, text, question)),

    /** Forks before a question and asks it again in the fork. */
    retry(entry: EntryId, again?: Question) {
      const question = entries.find(({ id }) => id === entry);
      if (session === undefined || question === undefined) {
        return;
      }

      void run(async () => {
        const page = await agent.call("entries", [
          { session, maxEntryId: question.id - 1, limit: 1 },
        ]);
        const before = page.items[0];

        const fork =
          before === undefined
            ? await agent.call("createSession")
            : await agent.call("fork", [{ session, at: before.id }]);
        await submit(fork, (question.model ?? []).map(messageText).join("\n"), again);
        await open(fork);
      });
    },

    stop: () => void run(() => agent.call("abort", [{ session }]).then(() => undefined)),

    setModel: (model: string, thinkingLevel?: ThinkingLevel) =>
      void run(() => agent.call("setModel", [model, { session, thinkingLevel }])),

    /** Notes that the engineer ran one of an answer's chips, so the chat shows it done. */
    markDone: (note: DoneNote) =>
      void (session === undefined ? undefined : run(() => write(session, DONE_ENTRY, note))),
  };
}
