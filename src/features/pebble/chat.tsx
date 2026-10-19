import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Maximize2, Plus } from "lucide-react";
import {
  type PointerEvent,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { type HtmlPortalNode, InPortal } from "react-reverse-portal";

import { threadUsed } from "#/lib/pebble/view";
import { ChatWelcome } from "#/pebble/chat-welcome";
import { Composer } from "#/pebble/composer";
import { ThreadPane } from "#/pebble/pane";
import { useSession } from "#/pebble/session";
import { ThreadPicker } from "#/pebble/thread-picker";
import {
  useActiveThread,
  useAgentRepo,
  useArchiveThread,
  useCreateThread,
  usePebbleModels,
  useRenameThread,
  useThreadConnection,
  useThreadUpdated,
} from "#/pebble/threads";
import { agentKey, threadQuery, threadsKey } from "#/queries";
import { Button, IconButton } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Skeleton } from "#/ui/skeleton";
import { type InView, pebbleContext } from "#src/features/pebble/context";
import {
  Conversation,
  ConversationSkeleton,
  readNoteBefore,
} from "#src/features/pebble/conversation";
import { type Mention, useMentions } from "#src/features/pebble/mentions";
import { recordRoute } from "#src/features/pebble/records";
import type { Question } from "#src/pebble/wire";
import type { ThreadConnection } from "#src/queries/client";
import type { Thread } from "#src/sdk/pebble";

// a click on these keeps its own meaning, so it never opens the main view
const OWN_CLICK =
  'a, button, input, textarea, select, summary, label, [role="button"], [role="menuitem"], [role="option"], [data-composer]';

/** Pebble in the shell's dock: the chat picker and New chat over the active chat, which the shell moves into it. */
export function Pebble({
  agent,
  active,
  onSelect,
  answeringThread,
  header,
  chat,
  onExpand,
  onDragStart,
}: {
  agent: string | undefined;
  active: string | undefined;
  onSelect(thread: string): void;
  answeringThread: string | undefined;
  header: ReactNode;
  /** Where the active chat shows while it isn't in the main view. */
  chat: ReactNode;
  /** A click in the panel outside its controls opens the chat in the main view. */
  onExpand?: (() => void) | undefined;
  /** A press on the header that may become a drag of the pane. */
  onDragStart?: ((event: PointerEvent<HTMLElement>) => void) | undefined;
}) {
  const repo = useAgentRepo(agent);
  const { threads, thread, error, isPending } = useActiveThread(active);
  const create = useCreateThread();
  const archive = useArchiveThread();
  const rename = useRenameThread();
  const section = useRef<HTMLElement>(null);
  // the chat renders through a portal, so its clicks reach the panel through the DOM rather than React
  const expand = useEffectEvent((event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    // a click in a dialog or menu Pebble opened lands outside the panel, and selecting text stays a read
    if (
      onExpand === undefined ||
      target === null ||
      !section.current?.contains(target) ||
      target.closest(OWN_CLICK) !== null ||
      (window.getSelection()?.toString() ?? "") !== ""
    ) {
      return;
    }
    onExpand();
  });
  useEffect(() => {
    const node = section.current;
    node?.addEventListener("click", expand);
    return () => node?.removeEventListener("click", expand);
  }, []);
  const failure = error ?? create.error ?? archive.error ?? rename.error;

  return (
    <section
      ref={section}
      aria-label="Pebble"
      data-layout="dock"
      className="flex h-full min-w-0 flex-col bg-surface"
    >
      <header
        onPointerDown={onDragStart}
        className="flex h-10 shrink-0 items-center gap-1 border-b border-divider px-2"
      >
        {isPending ? (
          <Skeleton aria-hidden className="mx-2 h-3.5 w-24" />
        ) : (
          thread !== undefined && (
            <ThreadPicker
              threads={threads}
              active={thread}
              disabled={create.isPending}
              onSelect={onSelect}
              answeringThread={answeringThread}
              archiving={archive.archiving}
              onRename={(renamed, title) => rename.mutate({ thread: renamed, title })}
              onArchive={(archived) => archive.mutate(archived.id)}
            />
          )
        )}
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label="New chat"
            size="small"
            disabled={create.isPending}
            onClick={() => create.mutate(repo, { onSuccess: ({ id }) => onSelect(id) })}
          >
            <Plus className="size-4" />
          </IconButton>
          {onExpand !== undefined && (
            <IconButton label="Open in main view" size="small" onClick={onExpand}>
              <Maximize2 className="size-4" />
            </IconButton>
          )}
          {header}
        </div>
      </header>
      {failure !== null && (
        <p role="alert" className="border-b border-divider px-4 py-2 type-label-13 text-danger">
          {failure.message}
        </p>
      )}
      {chat}
    </section>
  );
}

type ChatProps = {
  agent: string | undefined;
  /** What the engineer is looking at, sent ahead of a question with the records it names. */
  context: string;
  /** The records in view, or in the page the chat was opened in the main view from. */
  view: InView;
  prompts: readonly string[];
  prefill: string | undefined;
  onPrefilled(): void;
  /** A question went to `thread`, which may be one the question started. */
  onAsked(thread: string): void;
  /** Where the chat shows its side pane, while the main view has it open. */
  pane: HtmlPortalNode | undefined;
  onAnswering(thread: string | undefined): void;
};

// a first question waits here while the chat it started connects, which then asks it
const starting = new Map<string, { text: string; mentions: readonly Mention[] }>();

/** The active chat, mounted once so the side panel and the main view share its connection, scroll and prompt. */
export function ActiveChat({ active, ...props }: ChatProps & { active: string | undefined }) {
  const { thread, status, error, failureReason } = useActiveThread(active);
  const [attempt, setAttempt] = useState(0);
  if (error !== null) {
    return <Notice error={error.message} />;
  }
  if (status !== "success") {
    return failureReason === null ? (
      <ChatBody used>
        <LoadingChat thread={active} />
      </ChatBody>
    ) : (
      <Notice error="Pebble is unreachable. Retrying…" />
    );
  }
  return thread === undefined ? (
    <NewChat {...props} />
  ) : (
    <PebbleThread
      key={`${thread.id}:${attempt}`}
      thread={thread}
      onRetry={() => setAttempt((count) => count + 1)}
      {...props}
    />
  );
}

/** With no chats yet, the prompts show at once and the first question starts a chat. */
function NewChat({ agent, view, prompts, prefill, onPrefilled, onAsked }: ChatProps) {
  const { orgId } = useParams({ from: "/$orgId" });
  const repo = useAgentRepo(agent);
  const create = useCreateThread();
  const [mentioning, setMentioning] = useState(false);
  const mentions = useMentions({ orgId, agent, issue: view.issue, wanted: mentioning });

  async function send(text: string, named: readonly Mention[]) {
    try {
      const { id } = await create.mutateAsync(repo);
      starting.set(id, { text, mentions: named });
      onAsked(id);
      return true;
    } catch {
      return false;
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="min-h-6 flex-1" />
      <ChatWelcome leaving={create.isPending} onLeft={ignore} />
      <div className="min-h-6 flex-1" />
      <Composer
        thread={undefined}
        disabled={create.isPending}
        busy={false}
        models={[]}
        model={undefined}
        thinkingLevel={undefined}
        onModel={ignore}
        onThinkingLevel={ignore}
        mentions={mentions}
        onMentioning={() => setMentioning(true)}
        onSend={send}
        onStop={ignore}
        onType={ignore}
        onRetryWake={ignore}
        sandbox={undefined}
        prefill={prefill}
        onPrefilled={onPrefilled}
        suggestions={prompts}
      />
      {create.error !== null && (
        <p
          role="alert"
          className="mx-auto w-full max-w-(--chat-width) px-4 pb-2 type-label-13 text-danger"
        >
          {create.error.message}
        </p>
      )}
    </div>
  );
}

/** A connected chat with its composer. */
function PebbleThread({
  thread,
  onRetry,
  ...props
}: ChatProps & { thread: Thread; onRetry(): void }) {
  const { orgId } = useParams({ from: "/$orgId" });
  const queryClient = useQueryClient();
  const connection = useThreadConnection(thread.id);
  const failed = connection !== undefined && "error" in connection;
  // a chat that failed to connect may be gone, so the list reads again and the chat falls back to the latest or a new one
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (failed) {
      queryClient.removeQueries({ queryKey: threadQuery({ orgId, thread: thread.id }).queryKey });
      void queryClient
        .invalidateQueries({ queryKey: threadsKey({ orgId }) })
        .finally(() => setChecked(true));
    }
  }, [failed, orgId, queryClient, thread.id]);

  if (failed && checked) {
    return (
      <div className="flex items-center gap-2 px-4 py-4">
        <p role="alert" className="min-w-0 type-copy-14 text-muted">
          Pebble couldn't open this chat.
        </p>
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <ChatBody used={threadUsed(thread)}>
      {connection === undefined || failed ? (
        <LoadingChat thread={thread.id} />
      ) : (
        <Suspense fallback={<LoadingChat thread={thread.id} />}>
          <ThreadChat thread={thread} connection={connection} {...props} />
        </Suspense>
      )}
    </ChatBody>
  );
}

function Notice({ error }: { error: string }) {
  return (
    <p role="alert" className="px-4 py-4 type-copy-14 text-muted">
      {error}
    </p>
  );
}

const ignore = () => {};

/**
 * A chat with a used chat's transcript skeleton over it, which fades out as its history fades in.
 * It sits outside the connecting and connected layouts so it stays put while they swap.
 */
function ChatBody({ used, children }: { used: boolean; children: ReactNode }) {
  return (
    <div className="group/chat relative flex min-h-0 flex-1 flex-col">
      {children}
      {used && (
        <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto max-w-(--chat-width) px-4 pt-4 transition-[opacity,visibility] duration-200 group-has-[[aria-busy=false]]/chat:invisible group-has-[[aria-busy=false]]/chat:opacity-0">
          <ConversationSkeleton label="Loading chat" />
        </div>
      )}
    </div>
  );
}

/** The chat's layout before it connects, so the composer is in place from the start. */
function LoadingChat({ thread }: { thread: string | undefined }) {
  return (
    <>
      <div className="min-h-0 flex-1" />
      <Composer
        thread={thread}
        disabled
        busy={false}
        models={[]}
        model={undefined}
        thinkingLevel={undefined}
        onModel={ignore}
        onThinkingLevel={ignore}
        mentions={[]}
        onMentioning={ignore}
        onSend={() => Promise.resolve(false)}
        onStop={ignore}
        onType={ignore}
        onRetryWake={ignore}
        sandbox={undefined}
        prefill={undefined}
        onPrefilled={ignore}
      />
    </>
  );
}

function ThreadChat({
  thread,
  connection,
  agent,
  context,
  view: inView,
  prompts,
  prefill,
  onPrefilled,
  onAsked,
  pane,
  onAnswering,
}: ChatProps & { thread: Thread; connection: ThreadConnection }) {
  const { orgId } = useParams({ from: "/$orgId" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const models = usePebbleModels();
  const updated = useThreadUpdated();
  const repo = useAgentRepo(agent);
  const chat = useSession(connection, context, updated);
  const { view } = chat;
  const disabled = !chat.ready || chat.pending;
  const empty = !chat.loading && !chat.asked && !chat.hasEarlier && !chat.syncError && !view.busy;
  const [wasEmpty, setWasEmpty] = useState(empty);
  const [leaving, setLeaving] = useState(false);
  if (empty !== wasEmpty) {
    setWasEmpty(empty);
    setLeaving(!empty && (chat.asked || view.busy));
  }
  const finishLeaving = useCallback(() => setLeaving(false), []);
  const welcome = empty || leaving;
  const [mentioning, setMentioning] = useState(false);
  const mentions = useMentions({ orgId, agent, issue: inView.issue, wanted: mentioning });

  // the screen and the records in view and mentioned, read when the question goes
  async function question(named: readonly Mention[]) {
    const { text, read } = await pebbleContext(queryClient, {
      orgId,
      agent,
      workspace: repo !== undefined && thread.repos.includes(repo) ? repo : undefined,
      screen: context,
      view: inView,
      mentions: named,
    });
    return {
      context: text,
      note: { agent: agent ?? null, read, mentions: [...named] },
    } satisfies Question;
  }

  async function send(text: string, named: readonly Mention[]) {
    onAsked(thread.id);
    return chat.ask(text, await question(named));
  }

  // the first question of a chat it started, once the chat connects
  const askStarted = useEffectEvent(() => {
    const first = starting.get(thread.id);
    if (first !== undefined) {
      starting.delete(thread.id);
      void send(first.text, first.mentions);
    }
  });
  useEffect(() => {
    if (chat.ready && !chat.loading) {
      askStarted();
    }
  }, [chat.ready, chat.loading]);

  const answering = useEffectEvent(onAnswering);
  useEffect(() => {
    answering(view.busy ? thread.id : undefined);
    return () => answering(undefined);
  }, [view.busy, thread.id]);

  // Pebble's tools commit to the Agent's repository, so every view of the Agent reads again once a run that used one ends
  const lastTool = chat.entries.findLast(({ kind }) => kind === "pi.tool-result")?.id ?? 0;
  const seenTool = useRef<number>(undefined);
  useEffect(() => {
    if (chat.loading || view.busy || agent === undefined) {
      return;
    }
    if (seenTool.current !== undefined && lastTool > seenTool.current) {
      void queryClient.invalidateQueries({ queryKey: agentKey({ orgId, agent }) });
    }
    seenTool.current = lastTool;
  }, [chat.loading, view.busy, lastTool, agent, orgId, queryClient]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", welcome && "overflow-y-auto")}>
      {pane && (
        <InPortal node={pane}>
          <ThreadPane connection={connection} sandbox={chat.sandbox} onWake={chat.wake} />
        </InPortal>
      )}
      {welcome && <div className="min-h-6 flex-1" />}
      {welcome && <ChatWelcome leaving={leaving} onLeft={finishLeaving} />}
      {welcome && <div className="min-h-6 flex-1" />}
      <div
        aria-busy={chat.loading}
        className={cn(
          "flex min-h-0 flex-1 flex-col transition-opacity duration-200 aria-busy:opacity-0",
          welcome && "hidden",
        )}
      >
        <Conversation
          key={`conversation-${chat.session}`}
          agent={agent}
          entries={chat.entries}
          compactions={view.compactions}
          canLoadEarlier={
            chat.ready && chat.hasEarlier && !chat.loadingHistory && !chat.historyError
          }
          loadEarlier={chat.loadEarlier}
          onMention={(mention, asked) => void navigate(recordRoute(orgId, asked, mention.ref))}
          onDone={chat.markDone}
          header={
            <>
              {chat.loadingHistory && <ConversationSkeleton label="Loading earlier messages" />}
              {chat.historyError && !chat.loadingHistory && (
                <div className="flex items-center gap-2">
                  <p role="alert" className="min-w-0 type-label-13 text-danger">
                    {chat.historyError}
                  </p>
                  <Button
                    aria-label="Retry loading earlier messages"
                    size="small"
                    disabled={!chat.ready}
                    onClick={() => void chat.loadEarlier()}
                  >
                    Retry
                  </Button>
                </div>
              )}
            </>
          }
          partial={view.partial}
          busy={view.busy}
          canRetry={!disabled && !view.busy}
          onRetry={(entry) => {
            const named = readNoteBefore(chat.entries, entry)?.mentions ?? [];
            void question(named).then((again) => chat.retry(entry, again));
          }}
        >
          {chat.syncError && (
            <div className="flex items-center gap-2">
              <p role="alert" className="min-w-0 type-label-13 text-danger">
                {chat.syncError}
              </p>
              <Button
                aria-label="Retry loading messages"
                size="small"
                disabled={!chat.ready}
                onClick={chat.retrySync}
              >
                Retry
              </Button>
            </div>
          )}
        </Conversation>
      </div>
      <Composer
        key={`composer-${chat.session}`}
        thread={thread.id}
        disabled={disabled}
        busy={view.busy}
        models={models}
        model={view.model?.modelId}
        thinkingLevel={view.thinkingLevel}
        onModel={(model) => chat.setModel(model)}
        onThinkingLevel={(level) => {
          if (view.model !== undefined) {
            chat.setModel(view.model.modelId, level);
          }
        }}
        mentions={mentions}
        onMentioning={() => setMentioning(true)}
        onSend={send}
        onStop={chat.stop}
        onType={chat.wake}
        onRetryWake={chat.wake}
        sandbox={chat.sandbox}
        prefill={prefill}
        onPrefilled={onPrefilled}
        suggestions={empty ? prompts : undefined}
      />
      {chat.error !== undefined && (
        <p
          role="alert"
          className="mx-auto w-full max-w-(--chat-width) px-4 pb-2 type-label-13 text-danger"
        >
          {chat.error}
        </p>
      )}
    </div>
  );
}
