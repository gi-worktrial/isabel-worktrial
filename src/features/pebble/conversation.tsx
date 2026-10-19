// platform's pebble/conversation.tsx with Krish's keepers: the records each question read as Read chips, an answer's
// action chips and the ones the engineer ran, @mentions in a question, and the names the Walkthroughs read
import type {
  AssistantMessage,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type { EntryId, EntryRecord } from "@earendil-works/pi-durable";
import { Link, useParams } from "@tanstack/react-router";
import {
  BookOpen,
  Brain,
  Check,
  ListCollapse,
  LoaderCircle,
  FilePen,
  FilePlus,
  FileText,
  RotateCcw,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";

import { PatchView } from "#/file-diffs";
import { messageText, type ChatView } from "#/lib/pebble/view";
import { Bubble } from "#/ui/bubble";
import { IconButton } from "#/ui/button";
import { cn } from "#/ui/cn";
import { CopyButton } from "#/ui/copy-button";
import { Markdown } from "#/ui/markdown";
import { Message, MessageContent, MessageFooter } from "#/ui/message";
import { Tag } from "#/ui/tag";
import { RelativeTimestamp } from "#/ui/timestamp";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "#/ui/trace";
import { actionKey, DoneAction, PebbleActions } from "#src/features/pebble/actions";
import { type Mention, MentionText } from "#src/features/pebble/mentions";
import { recordRoute } from "#src/features/pebble/records";
import {
  ACTIONS_ENTRY,
  ActionsNoteSchema,
  DONE_ENTRY,
  type DoneNote,
  DoneNoteSchema,
  type PebbleAction,
  READ_ENTRY,
  type ReadNote,
  ReadNoteSchema,
  type ReadRecord,
} from "#src/pebble/wire";
import { Chip } from "#src/ui/chip";

// the shape lives with the route skeletons, which load with the first page
export { ConversationSkeleton } from "#src/features/pebble/skeletons";

const FOLLOW_DISTANCE_PX = 40;

// Pi's compaction and reset entries also carry a user message, so only these kinds are the chat.
const CHAT_ENTRIES: ReadonlySet<string> = new Set(["pi.user", "pi.assistant", "pi.tool-result"]);

/** The note written ahead of the question at `entry`: the newest one before it. */
export function readNoteBefore(
  entries: readonly EntryRecord[],
  entry: EntryId,
): ReadNote | undefined {
  const note = entries.findLast(({ id, kind }) => kind === READ_ENTRY && id < entry);
  return ReadNoteSchema.safeParse(note?.data).data;
}

type ToolResults = ReadonlyMap<string, ToolResultMessage>;
type AnswerItem =
  | { kind: "message"; key: string; message: AssistantMessage }
  | { kind: "compaction"; key: string };
// an answer's chips, from the entry the demo writes after it
type Actions = { entry: EntryId; list: PebbleAction[] };

export function Conversation({
  agent,
  entries,
  partial,
  busy,
  canRetry,
  onRetry,
  compactions,
  canLoadEarlier,
  loadEarlier,
  onMention,
  onDone,
  header,
  children,
}: {
  /** The Agent in view, for turns asked before notes named theirs. */
  agent: string | undefined;
  entries: readonly EntryRecord[];
  partial: AssistantMessage | undefined;
  busy: boolean;
  canRetry: boolean;
  onRetry: (question: EntryId) => void;
  compactions: ChatView["compactions"];
  canLoadEarlier: boolean;
  loadEarlier(): Promise<void>;
  onMention(mention: Mention, agent: string): void;
  onDone(note: DoneNote): void;
  header: ReactNode;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const historyTop = useRef<HTMLDivElement>(null);
  const onEarlier = useEffectEvent(() => {
    void loadEarlier();
  });
  const anchor = useRef<{ key: string; offset: number }>(undefined);
  const size = useRef({ width: 0, height: 0 });
  const restoredTop = useRef<number>(undefined);
  const messages = entries
    .filter(({ kind }) => CHAT_ENTRIES.has(kind))
    .flatMap(({ model = [] }) => model);
  const results: ToolResults = new Map(
    messages.flatMap((message) =>
      message.role === "toolResult" ? [[message.toolCallId, message] as const] : [],
    ),
  );
  const working = messages.some(
    (message) =>
      message.role === "assistant" &&
      message.content.some((part) => part.type === "toolCall" && !results.has(part.id)),
  );
  const compacting = compactions.some(({ blocking }) => blocking);
  const thinking =
    busy &&
    !compacting &&
    !working &&
    (partial === undefined ||
      answerBlocks([{ kind: "message", key: "partial", message: partial }]).length === 0);
  const turns = chatTurns(entries, busy ? partial : undefined, busy && !compacting);
  const done = entries.flatMap(({ kind, data }) =>
    kind === DONE_ENTRY ? (DoneNoteSchema.safeParse(data).data ?? []) : [],
  );

  function rememberPosition() {
    const box = scroller.current;
    // A chat moving between the dock and fullscreen is briefly detached, with nothing to measure.
    if (!box || following.current || box.clientWidth === 0) {
      return;
    }

    const top = box.getBoundingClientRect().top;
    anchor.current = undefined;
    for (const message of box.querySelectorAll<HTMLElement>("[data-scroll-anchor]")) {
      const rect = message.getBoundingClientRect();
      const key = message.dataset.scrollAnchor;
      if (key !== undefined && rect.height > 0 && rect.bottom > top) {
        anchor.current = { key, offset: rect.top - top };
        return;
      }
    }
  }

  function restorePosition() {
    const box = scroller.current;
    if (!box) {
      return;
    }

    if (following.current) {
      box.scrollTop = box.scrollHeight;
    } else if (anchor.current) {
      const element = box.querySelector(`[data-scroll-anchor="${anchor.current.key}"]`);
      if (element) {
        box.scrollTop +=
          element.getBoundingClientRect().top -
          box.getBoundingClientRect().top -
          anchor.current.offset;
      } else {
        // A streamed answer is rekeyed once it's saved.
        rememberPosition();
      }
    }
    restoredTop.current = box.scrollTop;
  }

  useLayoutEffect(restorePosition);

  // Reattaching or resizing the chat resets or reflows its scroll, so it returns to the same message.
  const onResize = useEffectEvent(() => {
    const box = scroller.current;
    if (box) {
      size.current = { width: box.clientWidth, height: box.clientHeight };
    }
    restorePosition();
  });
  useEffect(() => {
    const box = scroller.current;
    if (!box) {
      return;
    }

    const observer = new ResizeObserver(() => onResize());
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const firstEntry = entries[0]?.id;
  useEffect(() => {
    const root = scroller.current;
    const top = historyTop.current;
    if (!canLoadEarlier || !root || !top) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onEarlier();
        }
      },
      { root, rootMargin: "200px 0px 0px" },
    );
    observer.observe(top);
    return () => observer.disconnect();
  }, [canLoadEarlier, firstEntry]);

  return (
    <div
      ref={scroller}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto [overflow-anchor:none]"
      onScroll={({ currentTarget: box }) => {
        // Only the reader moves the anchor: skip our own restores, and reflows at a new size that fire before the resize observer.
        if (
          box.scrollTop === restoredTop.current ||
          box.clientWidth !== size.current.width ||
          box.clientHeight !== size.current.height
        ) {
          return;
        }

        following.current =
          box.scrollHeight - box.scrollTop - box.clientHeight < FOLLOW_DISTANCE_PX;
        rememberPosition();
      }}
    >
      <div className="mx-auto flex w-full max-w-(--chat-width) flex-1 flex-col px-4 pt-4 pb-6">
        <div ref={historyTop} />
        <div role="log" aria-label="Conversation" className="flex shrink-0 flex-col gap-6">
          {header}
          {turns.map((turn, index) => {
            // a chat follows the engineer across Agents, so its records belong to the Agent each question was asked under
            const asked = turn.note?.agent ?? agent;
            if (turn.kind === "user") {
              return (
                <Message key={turn.key} align="end" data-scroll-anchor={turn.key}>
                  <MessageContent data-turn="user">
                    <Bubble aria-label="Your message">
                      <MentionText
                        text={messageText(turn.user)}
                        mentions={turn.note?.mentions ?? []}
                        onOpen={(mention) => asked !== undefined && onMention(mention, asked)}
                      />
                    </Bubble>
                  </MessageContent>
                </Message>
              );
            }

            const latest = index === turns.length - 1;
            const live = busy && latest;
            const { question, actions } = turn;
            return (
              <Answer
                key={turn.key}
                agent={asked}
                read={turn.note?.read ?? []}
                actions={actions?.list ?? []}
                done={
                  new Set(
                    done
                      .filter((note) => note.actions === actions?.entry)
                      .map(({ action }) => actionKey(action)),
                  )
                }
                onDone={(action) =>
                  actions !== undefined && onDone({ actions: actions.entry, action })
                }
                items={turn.items}
                startedAt={turn.startedAt}
                results={results}
                busy={busy}
                live={live}
                latest={latest}
                canRetry={canRetry}
                onRetry={question === undefined ? undefined : () => onRetry(question)}
                streaming={live && partial !== undefined}
                thinking={live && thinking}
                compacting={live && compacting}
              />
            );
          })}
          {compactions.length > 0 && (
            <div role="status">
              <TraceLine status="running">
                <TraceIcon>
                  <LoaderCircle className="motion-safe:animate-spin" />
                </TraceIcon>
                <TraceTitle>Compacting context</TraceTitle>
              </TraceLine>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

type Turn =
  | { kind: "user"; key: string; user: UserMessage; question: EntryId; note: ReadNote | undefined }
  | {
      kind: "answer";
      key: string;
      items: AnswerItem[];
      startedAt: number | undefined;
      question: EntryId | undefined;
      note: ReadNote | undefined;
      actions: Actions | undefined;
    };

function chatTurns(
  entries: readonly EntryRecord[],
  partial: AssistantMessage | undefined,
  answering: boolean,
): Turn[] {
  const turns: Turn[] = [];
  // the records the next question reads and mentions, written just ahead of it
  let note: ReadNote | undefined;
  function answer(key: string) {
    const last = turns.at(-1);
    if (last?.kind === "answer") {
      return last;
    }

    const turn: Extract<Turn, { kind: "answer" }> = {
      kind: "answer",
      key: last ? `${last.key}-answer` : key,
      items: [],
      startedAt: last?.user.timestamp,
      question: last?.question,
      note: last?.note,
      actions: undefined,
    };
    turns.push(turn);
    return turn;
  }

  for (const { id, kind, model = [], data } of entries) {
    if (kind === READ_ENTRY) {
      note = ReadNoteSchema.safeParse(data).data;
      continue;
    }
    if (kind === ACTIONS_ENTRY) {
      const list = ActionsNoteSchema.safeParse(data).data;
      const last = turns.at(-1);
      if (list !== undefined && last?.kind === "answer") {
        last.actions = { entry: id, list };
      }
      continue;
    }
    if (kind === "pi.compaction") {
      const key = `${id}-compaction`;
      answer(key).items.push({ kind: "compaction", key });
      continue;
    }
    if (!CHAT_ENTRIES.has(kind)) {
      continue;
    }

    for (const [index, message] of model.entries()) {
      const key = `${id}-${index}`;
      if (message.role === "user") {
        turns.push({ kind: "user", key, user: message, question: id, note });
        note = undefined;
        answer(key);
      } else if (message.role === "assistant") {
        answer(key).items.push({ kind: "message", key, message });
      }
    }
  }
  if (partial) {
    answer("partial").items.push({ kind: "message", key: "partial", message: partial });
  } else if (answering) {
    answer("pending");
  }

  return turns;
}

type Step = ThinkingContent | ToolCall;

type Block =
  | { kind: "text"; key: string; text: string }
  | { kind: "steps"; key: string; steps: Step[] }
  | { kind: "error"; key: string; text: string | undefined }
  | { kind: "compaction"; key: string };

/** Text stays prose, and each run of reasoning and tool calls between texts becomes one Trace. */
function answerBlocks(items: readonly AnswerItem[]): Block[] {
  const blocks: Block[] = [];
  for (const item of items) {
    if (item.kind === "compaction") {
      blocks.push(item);
      continue;
    }

    const {
      key: messageKey,
      message: { content, stopReason, errorMessage },
    } = item;
    for (const [index, part] of content.entries()) {
      const key = `${messageKey}-${index}`;
      if (part.type === "text") {
        if (part.text.trim() !== "") {
          blocks.push({ kind: "text", key, text: part.text });
        }
      } else if (part.type === "toolCall" || (!part.redacted && part.thinking.trim() !== "")) {
        const last = blocks.at(-1);
        if (last?.kind === "steps") {
          last.steps.push(part);
        } else {
          blocks.push({ kind: "steps", key, steps: [part] });
        }
      }
    }
    if (stopReason === "error") {
      blocks.push({ kind: "error", key: `${messageKey}-error`, text: errorMessage });
    }
  }

  return blocks;
}

function Answer({
  agent,
  read,
  actions,
  done,
  onDone,
  items,
  startedAt,
  results,
  busy,
  live,
  latest,
  canRetry,
  onRetry,
  streaming,
  thinking,
  compacting,
}: {
  agent: string | undefined;
  read: readonly ReadRecord[];
  actions: readonly PebbleAction[];
  done: ReadonlySet<string>;
  onDone(action: PebbleAction): void;
  items: readonly AnswerItem[];
  startedAt: number | undefined;
  results: ToolResults;
  busy: boolean;
  live: boolean;
  latest: boolean;
  canRetry: boolean;
  onRetry: (() => void) | undefined;
  streaming: boolean;
  thinking: boolean;
  compacting: boolean;
}) {
  const { orgId } = useParams({ from: "/$orgId" });
  const blocks = answerBlocks(items);
  const sections: Array<{ key: string; blocks: Block[] }> = [{ key: "answer", blocks: [] }];
  for (const block of blocks) {
    sections.at(-1)?.blocks.push(block);
    if (block.kind === "compaction") {
      sections.push({ key: block.key, blocks: [] });
    }
  }
  const text = blocks.flatMap((block) => (block.kind === "text" ? [block.text] : [])).join("\n\n");
  const message = items.filter((item) => item.kind === "message").at(-1)?.message;
  const stopped = message?.stopReason === "aborted";
  const lastPart = streaming ? message?.content.at(-1) : undefined;
  const endedAt = message?.timestamp;
  // what Pebble read and the chips it ran name records under the Agent the question was asked in
  const records = agent === undefined ? [] : read;
  const ran =
    agent === undefined
      ? []
      : actions.filter(
          (action): action is Exclude<PebbleAction, { kind: "open" }> =>
            action.kind !== "open" && done.has(actionKey(action)),
        );
  const blockView = (block: Block) => (
    <div key={block.key} data-scroll-anchor={block.key}>
      <BlockView block={block} results={results} busy={busy} lastPart={lastPart} />
    </div>
  );

  return (
    <Message>
      <MessageContent
        data-turn={live ? undefined : "pebble"}
        role={live ? "status" : undefined}
        aria-busy={live || undefined}
        aria-label={live ? `Pebble is ${thinking ? "thinking" : "answering"}` : undefined}
      >
        {sections.flatMap(({ key, blocks: section }, index) => {
          const split = section.reduce((at, { kind }, i) => (kind === "steps" ? i + 1 : at), 0);
          const work = section.slice(0, split);
          const current = index === sections.length - 1;
          const shownRead = agent !== undefined && index === 0 ? records : [];
          const shownRan = agent !== undefined && current ? ran : [];
          const steps = work.length > 0 || shownRead.length > 0 || shownRan.length > 0;
          return [
            (steps || (current && thinking)) && (
              <Work
                key={`${key}-work`}
                line={
                  current && live && !compacting ? (
                    <LiveLine work={work} results={results} busy={busy} lastPart={lastPart} />
                  ) : (
                    <DoneLine
                      work={work}
                      duration={
                        current && startedAt !== undefined && endedAt !== undefined
                          ? endedAt - startedAt
                          : undefined
                      }
                    />
                  )
                }
              >
                {steps && (
                  <>
                    {agent !== undefined && shownRead.length > 0 && (
                      <ReadStep orgId={orgId} agent={agent} read={shownRead} />
                    )}
                    {work.map(blockView)}
                    {agent !== undefined &&
                      shownRan.map((action) => (
                        <TraceLine key={actionKey(action)}>
                          <TraceIcon>
                            <Check />
                          </TraceIcon>
                          <TraceTitle>
                            <DoneAction orgId={orgId} agent={agent} action={action} />
                          </TraceTitle>
                        </TraceLine>
                      ))}
                  </>
                )}
              </Work>
            ),
            ...section.slice(split).map(blockView),
          ];
        })}
        {!live && (
          <PebbleActions
            orgId={orgId}
            agent={agent}
            actions={actions}
            done={done}
            onDone={onDone}
          />
        )}
        {!live && (message !== undefined || onRetry !== undefined) && (
          <MessageFooter
            className={cn(
              !latest &&
                "opacity-0 group-focus-within/message:opacity-100 group-hover/message:opacity-100 motion-safe:transition-opacity",
            )}
          >
            {text !== "" && <CopyButton text={text} />}
            {onRetry && (
              <IconButton label="Retry" size="small" disabled={!canRetry} onClick={onRetry}>
                <RotateCcw className="size-4" />
              </IconButton>
            )}
            {stopped && <Tag className="ml-1">Stopped</Tag>}
            {endedAt !== undefined && (
              <RelativeTimestamp
                at={new Date(endedAt).toISOString()}
                className="ml-1 type-meta-12 text-muted"
              />
            )}
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}

// the records in view and the ones mentioned, each a chip that opens it, read like a tool call
function ReadStep({
  orgId,
  agent,
  read,
}: {
  orgId: string;
  agent: string;
  read: readonly ReadRecord[];
}) {
  return (
    <div
      role="group"
      aria-label="Pebble read"
      className="flex min-w-0 flex-wrap items-center gap-2"
    >
      <TraceLine>
        <TraceIcon>
          <BookOpen />
        </TraceIcon>
        <TraceTitle>Read</TraceTitle>
      </TraceLine>
      {read.map(({ ref, label }) => (
        <Chip key={JSON.stringify(ref)} kind={CHIP_KINDS[ref.record]} asChild>
          <Link {...recordRoute(orgId, agent, ref)}>{label}</Link>
        </Chip>
      ))}
    </div>
  );
}

const CHIP_KINDS = {
  issue: "issue",
  candidate: "candidates",
  eval: "evals",
  trace: "traces",
} as const satisfies Record<ReadRecord["ref"]["record"], string>;

function Work({ line, children }: { line: ReactNode; children: ReactNode }) {
  return children ? (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="gap-3">{children}</TraceCollapsibleContent>
    </TraceCollapsible>
  ) : (
    line
  );
}

function workCalls(work: readonly Block[]): ToolCall[] {
  return work.flatMap((block) =>
    block.kind === "steps" ? block.steps.filter((step) => step.type === "toolCall") : [],
  );
}

function LiveLine({
  work,
  results,
  busy,
  lastPart,
}: {
  work: readonly Block[];
  results: ToolResults;
  busy: boolean;
  lastPart: AssistantMessage["content"][number] | undefined;
}) {
  const running = workCalls(work)
    .filter((call) => toolStatus(results.get(call.id), busy) === "running")
    .at(-1);
  if (running) {
    const {
      icon: Icon,
      verbs,
      subject,
    } = toolLabel(running.name, toolArgumentsSchema.parse(running.arguments));
    return (
      <TraceLine status="running">
        <TraceIcon>
          <Icon />
        </TraceIcon>
        <TraceTitle>
          {verbs[0]} <span className="type-mono-12">{subject}</span>
        </TraceTitle>
      </TraceLine>
    );
  }

  return (
    <TraceLine status="running">
      <TraceIcon>
        <Brain />
      </TraceIcon>
      <TraceTitle>{lastPart?.type === "text" ? "Working" : "Thinking"}</TraceTitle>
    </TraceLine>
  );
}

function DoneLine({ work, duration }: { work: readonly Block[]; duration: number | undefined }) {
  const calls = workCalls(work);
  return (
    <TraceLine>
      <TraceTitle>
        {duration === undefined ? "Worked" : `Worked for ${elapsed(duration)}`}
      </TraceTitle>
      {calls.length > 0 && (
        <TraceDescription>
          {calls.length} {calls.length === 1 ? "step" : "steps"}
        </TraceDescription>
      )}
    </TraceLine>
  );
}

function elapsed(millis: number) {
  const seconds = Math.max(1, Math.round(millis / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function BlockView({
  block,
  results,
  busy,
  lastPart,
}: {
  block: Block;
  results: ToolResults;
  busy: boolean;
  lastPart: AssistantMessage["content"][number] | undefined;
}) {
  switch (block.kind) {
    case "compaction":
      return (
        <TraceLine>
          <TraceIcon>
            <ListCollapse />
          </TraceIcon>
          <TraceTitle>Context automatically compacted</TraceTitle>
        </TraceLine>
      );
    case "text":
      return <Markdown text={block.text} />;
    case "error":
      return (
        <p role="alert" className="type-label-13 text-danger">
          {block.text}
        </p>
      );
    case "steps":
      return (
        <Trace>
          {block.steps.map((step) =>
            step.type === "thinking" ? (
              <ReasoningStep
                key={`${block.key}-${block.steps.indexOf(step)}`}
                text={step.thinking}
                running={step === lastPart}
              />
            ) : (
              <ToolStep key={step.id} call={step} result={results.get(step.id)} busy={busy} />
            ),
          )}
        </Trace>
      );
  }
}

function ReasoningStep({ text, running }: { text: string; running: boolean }) {
  const [open, setOpen] = useState<boolean>();
  return (
    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>
        <TraceLine status={running ? "running" : undefined}>
          <TraceIcon>
            <Brain />
          </TraceIcon>
          <TraceTitle>{running ? "Thinking" : "Thought"}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent aria-label="Reasoning summary" className="whitespace-pre-wrap">
        {text}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

function toolStatus(result: ToolResultMessage | undefined, busy: boolean) {
  return result === undefined && busy ? "running" : undefined;
}

type ToolLabel = {
  icon: LucideIcon;
  verbs: readonly [running: string, done: string];
  subject: string;
};

const editDetailsSchema = z.object({ patch: z.string() });

type ToolArguments = z.output<typeof toolArgumentsSchema>;

// Partial while the call streams, so a missing or malformed field reads as empty.
const toolArgumentsSchema = z.object({
  command: z.string().catch(""),
  path: z.string().catch(""),
  content: z.string().catch(""),
});

function toolLabel(name: string, { command, path }: ToolArguments): ToolLabel {
  switch (name) {
    case "bash":
      return { icon: Terminal, verbs: ["Running", "Ran"], subject: command };
    case "read":
      return { icon: FileText, verbs: ["Reading", "Read"], subject: path };
    case "edit":
      return { icon: FilePen, verbs: ["Editing", "Edited"], subject: path };
    case "write":
      return { icon: FilePlus, verbs: ["Writing", "Wrote"], subject: path };
    default:
      return { icon: Wrench, verbs: ["Calling", "Called"], subject: name };
  }
}

function ToolStep({
  call,
  result,
  busy,
}: {
  call: ToolCall;
  result: ToolResultMessage | undefined;
  busy: boolean;
}) {
  const args = toolArgumentsSchema.parse(call.arguments);
  const { icon: Icon, verbs, subject } = toolLabel(call.name, args);
  const status = toolStatus(result, busy);
  const verb = status === "running" ? verbs[0] : verbs[1];

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger aria-label={`Tool call ${call.name}`}>
        <TraceLine status={status}>
          <TraceIcon>
            <Icon />
          </TraceIcon>
          <TraceTitle>
            {verb} <span className="type-mono-12">{subject}</span>
          </TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <ToolDetail call={call} args={args} result={result} />
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

function ToolDetail({
  call,
  args,
  result,
}: {
  call: ToolCall;
  args: ToolArguments;
  result: ToolResultMessage | undefined;
}) {
  const output = result && messageText(result);
  if (result?.isError) {
    return <CodeBlock>{output ?? ""}</CodeBlock>;
  }

  switch (call.name) {
    case "bash":
      return (
        <>
          <CodeBlock>{`$ ${args.command}`}</CodeBlock>
          {output && <CodeBlock>{output}</CodeBlock>}
        </>
      );
    case "read":
      return output && <CodeBlock>{output}</CodeBlock>;
    case "write":
      return <CodeBlock>{args.content}</CodeBlock>;
    case "edit": {
      const details = editDetailsSchema.safeParse(result?.details);
      return details.success ? (
        <div className="max-h-64 overflow-auto rounded-sm ring-1 ring-divider">
          <PatchView patch={details.data.patch} />
        </div>
      ) : (
        output && <CodeBlock>{output}</CodeBlock>
      );
    }
    default:
      return (
        <>
          <CodeBlock>{JSON.stringify(call.arguments, null, 2)}</CodeBlock>
          {output && <CodeBlock>{output}</CodeBlock>}
        </>
      );
  }
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-sm bg-subtle px-3 py-2 type-mono-12 whitespace-pre-wrap text-ink ring-1 ring-divider">
      {children}
    </pre>
  );
}
