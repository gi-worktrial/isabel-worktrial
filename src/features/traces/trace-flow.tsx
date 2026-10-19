import {
  ArrowDown,
  ArrowUpRight,
  Bot,
  ChevronRight,
  MessageSquare,
  User,
  Wrench,
  X,
} from "lucide-react";
import { Fragment, useState } from "react";

import {
  type TurnSpans,
  SpanPageLink,
  ToolCall,
  failingSteps,
  modelText,
  operation,
  outputText,
  stepNotes,
  turnSpans,
} from "#/trace-view";
import { spanError } from "#/traces";
import { Button, IconButton } from "#/ui/button";
import { cn } from "#/ui/cn";
import { flat } from "#/ui/format";
import { Markdown } from "#/ui/markdown";
import { Tag } from "#/ui/tag";
import { formatDuration } from "#src/features/traces/duration";
import { markedSteps, stepName } from "#src/features/traces/failure";
import { StepNotes, citationSources } from "#src/features/traces/transcript";
import { SPANS_LINK, TurnNumber } from "#src/features/traces/turn-row";
import type { Annotation, Span, Turn } from "#src/sdk/agents";
import { CitationSources } from "#src/ui/citation";

// every kind is neutral, told apart by its icon, so the only color is a failure's red
const KINDS = { user: User, agent: Bot, model: MessageSquare, tool: Wrench };

export type StepKind = keyof typeof KINDS;

export type FlowStep = {
  id: string;
  kind: StepKind;
  name: string;
  turn: number;
  /** The span behind the step, absent for the user message, which is the turn's input. */
  span: Span | undefined;
  errored: boolean;
};

/** A turn's steps in order: the user message, each message, reasoning and tool call (a subagent's own steps in place), then the Agent response. */
export function flowSteps(view: TurnSpans): FlowStep[] {
  const { turn, children, topLevel, reply, prompt } = view;
  const step = (span: Span, kind: StepKind): FlowStep => ({
    id: span.span_id,
    kind,
    name: stepName(view, span),
    turn: turn.position,
    span,
    errored: spanError(span) !== undefined,
  });
  const walk = (spans: readonly Span[]): FlowStep[] =>
    spans.flatMap((span) => {
      if (span === reply) {
        return [];
      }
      const nested = walk(children.get(span.span_id) ?? []);
      if (operation(span) === "execute_tool") {
        return [step(span, "tool"), ...nested];
      }
      const text = operation(span) === "chat" ? modelText(span) : undefined;
      if (text === undefined) {
        return nested;
      }
      return [step(span, text.reply ? "agent" : "model"), ...nested];
    });

  return [
    ...(prompt
      ? [
          {
            id: turn.trace_id,
            kind: "user" as const,
            name: "User message",
            turn: turn.position,
            span: undefined,
            errored: false,
          },
        ]
      : []),
    ...walk(topLevel),
    ...(reply ? [step(reply, "agent")] : []),
  ];
}

type FlowPill = { key: string; kind: StepKind; name: string; steps: FlowStep[] };

/**
 * A turn's pills in order after its question: reasoning only where it must show (failing or open), and a run of one
 * tool, or of one kind of message, folded into one pill that counts its calls.
 */
export function flowPills(steps: readonly FlowStep[], keep: (step: FlowStep) => boolean) {
  const pills: FlowPill[] = [];
  for (const step of steps) {
    if (step.kind === "user" || (step.kind === "model" && !keep(step))) {
      continue;
    }
    const last = pills.at(-1);
    if (last !== undefined && last.kind === step.kind && last.name === step.name) {
      last.steps.push(step);
    } else {
      pills.push({ key: step.id, kind: step.kind, name: step.name, steps: [step] });
    }
  }
  return pills;
}

/** The pills a turn shows before the rest fold, so a long turn stays about one line. */
const PILL_CAP = 16;

type FoldedPills = { key: string; more: number };

/** A long turn's pills past the cap folded into "+N more", each hidden run one fold, always showing what `keep` names. */
export function foldPills(pills: readonly FlowPill[], keep: (pill: FlowPill) => boolean) {
  if (pills.length <= PILL_CAP + 1) {
    return [...pills];
  }
  const items: Array<FlowPill | FoldedPills> = [];
  for (const [index, pill] of pills.entries()) {
    const last = items.at(-1);
    if (index < PILL_CAP || keep(pill)) {
      items.push(pill);
    } else if (last !== undefined && "more" in last) {
      last.more += 1;
    } else {
      items.push({ key: `more:${pill.key}`, more: 1 });
    }
  }
  return items;
}

/**
 * A session turn by turn: its number, duration, question (which opens the user's message) and Spans, then a pill
 * per step in order (runs of one tool folded, a long turn folded past its first pills), failing steps red. A pill opens
 * its step's input and output (and why it fails) under its turn, and Next failure walks the failing steps.
 */
export function TraceFlow({
  annotations,
  turns,
}: {
  annotations: readonly Annotation[];
  turns: readonly Turn[];
}) {
  const [open, setOpen] = useState<string>();
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => setOpen(id === open ? undefined : id);
  const views = turns.map(turnSpans);
  const failing = failingSteps(views, annotations);
  const marked = markedSteps(failing);
  const notes = stepNotes(views, annotations, failing);
  const fails = (step: FlowStep) => step.errored || marked.has(step.id);
  const failures = views.flatMap(flowSteps).filter(fails);
  const at = failures.findIndex(({ id }) => id === open);
  const several = views.length > 1;

  return (
    <CitationSources value={citationSources(turns, setOpen)}>
      <div role="group" aria-label="Flow" className="@container flex flex-col gap-2">
        {failures.length > 0 && (
          <Button
            variant="quiet"
            size="small"
            onClick={() => setOpen(failures[(at + 1) % failures.length]?.id)}
            className="self-end"
          >
            <ArrowDown aria-hidden="true" className="size-3.5" />
            Next failure
            {at !== -1 && (
              <span className="tabular-nums">
                {at + 1}/{failures.length}
              </span>
            )}
          </Button>
        )}
        <ol aria-label="Flow steps" className="flex flex-col gap-1">
          {views.map((view) => {
            const { trace_id } = view.turn;
            const steps = flowSteps(view);
            const shows = (step: FlowStep) => fails(step) || step.id === open;
            const pills = flowPills(steps, shows);
            const items = unfolded.has(trace_id)
              ? pills
              : foldPills(pills, (pill) => pill.steps.some(shows));
            const detail = steps.find((step) => step.id === open);
            return (
              <li key={trace_id} className="flex flex-col pb-2">
                {/* the turn's header reads as a closed turn in Steps, its pills under it */}
                <div className="flex h-8 min-w-0 items-center gap-3">
                  <TurnNumber turn={view.turn} />
                  <button
                    type="button"
                    aria-expanded={open === trace_id}
                    disabled={!view.prompt}
                    onClick={() => toggle(trace_id)}
                    className="-mx-2 h-7 min-w-0 flex-1 truncate rounded-xs px-2 text-left type-copy-14 font-medium text-ink enabled:hover:bg-fill"
                  >
                    {flat(view.prompt)}
                  </button>
                  <span className="shrink-0 type-meta-12 text-muted tabular-nums">
                    {formatDuration(view.turn.duration_ns)}
                  </span>
                  <SpanPageLink trace={trace_id} className={SPANS_LINK}>
                    Spans
                    <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </SpanPageLink>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-2">
                  {items.map((item, index) => (
                    <Fragment key={item.key}>
                      {index > 0 && (
                        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-faint" />
                      )}
                      {"more" in item ? (
                        <button
                          type="button"
                          onClick={() => setUnfolded(new Set(unfolded).add(trace_id))}
                          className="inline-flex h-6 items-center rounded-xs px-2 type-meta-12 font-medium text-muted tabular-nums hover:bg-fill hover:text-ink"
                        >
                          +{item.more} more
                        </button>
                      ) : (
                        <Pill
                          pill={item}
                          failing={item.steps.find(fails)}
                          open={item.steps.some((step) => step.id === open)}
                          turn={several ? view.turn.position : undefined}
                          onOpen={toggle}
                        />
                      )}
                    </Fragment>
                  ))}
                </div>
                {detail !== undefined && (
                  <StepDetail
                    step={detail}
                    view={view}
                    notes={notes.get(detail.id)}
                    onClose={() => toggle(detail.id)}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </CitationSources>
  );
}

/**
 * A step, or a run of one tool as "Name ×3": neutral with its kind's icon, red with an x when one of its steps fails
 * (the one it opens), and on the selection fill while picked.
 */
function Pill({
  pill,
  failing,
  open,
  turn,
  onOpen,
}: {
  pill: FlowPill;
  failing: FlowStep | undefined;
  open: boolean;
  turn: number | undefined;
  onOpen(id: string): void;
}) {
  const Icon = failing === undefined ? KINDS[pill.kind] : X;
  const count = pill.steps.length;
  const tint = failing === undefined ? "bg-inset text-ink" : "bg-danger-tint text-danger";
  return (
    <button
      type="button"
      title={count > 1 ? `${pill.name} ×${count}` : pill.name}
      aria-expanded={open}
      onClick={() => onOpen(failing?.id ?? pill.key)}
      className={cn(
        "inline-flex h-6 max-w-64 min-w-0 items-center gap-1 rounded-xs px-2 type-meta-12 font-medium outline-none hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring dark:hover:brightness-125",
        !open
          ? tint
          : failing === undefined
            ? "bg-selection text-ink"
            : `${tint} outline-1 outline-current`,
      )}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={failing === undefined ? 2 : 2.5}
        className={cn("size-3 shrink-0", failing === undefined && "text-muted")}
      />
      <span className={cn("min-w-0 truncate", pill.kind === "tool" && "type-mono-12")}>
        {pill.name}
      </span>
      {count > 1 && (
        <span aria-hidden="true" className="shrink-0 text-muted tabular-nums">
          ×{count}
        </span>
      )}
      <span className="sr-only">
        {pill.kind === "tool"
          ? count > 1
            ? `, ${count} tool calls`
            : ", tool call"
          : count > 1 && `, ${count} times`}
        {turn !== undefined && `, Turn ${turn}`}
        {failing !== undefined && ", fails here"}
      </span>
    </button>
  );
}

/** A step's input and output under its turn, with why it fails. */
function StepDetail({
  step,
  view,
  notes,
  onClose,
}: {
  step: FlowStep;
  view: TurnSpans;
  notes: readonly Annotation[] | undefined;
  onClose(): void;
}) {
  const { span } = step;
  const text = span !== undefined && operation(span) === "chat" ? modelText(span) : undefined;
  const said =
    span === undefined ? view.prompt : span === view.reply ? outputText(span) : text?.reply;

  return (
    <section
      aria-label={`${step.name} detail`}
      className="@container mt-2 flex flex-col gap-2 rounded-sm border border-divider px-3 pt-1 pb-3"
    >
      <header className="flex h-8 min-w-0 items-center gap-2">
        <p
          className={cn(
            "min-w-0 truncate type-label-13 font-medium text-ink",
            step.kind === "tool" && "type-mono-12",
          )}
        >
          {step.name}
        </p>
        {step.errored && <Tag tone="danger">Error</Tag>}
        {step.kind === "tool" && span !== undefined && (
          <span className="shrink-0 type-label-13 text-muted tabular-nums">
            {formatDuration(span.duration_ns)}
          </span>
        )}
        <IconButton label="Close" size="small" onClick={onClose} className="ml-auto">
          <X className="size-3.5" />
        </IconButton>
      </header>
      {step.kind === "tool" && span !== undefined ? (
        <ToolCall span={span} />
      ) : (
        <div className="flex max-w-reading flex-col gap-2 type-copy-14 whitespace-pre-wrap wrap-anywhere">
          {text?.reasoning && <p className="text-muted">{text.reasoning}</p>}
          {said &&
            (span === undefined ? <p className="text-ink">{said}</p> : <Markdown text={said} />)}
        </div>
      )}
      {notes !== undefined && (
        <section aria-label="Grade reasoning">
          <StepNotes step={step.id} notes={notes} />
        </section>
      )}
    </section>
  );
}
