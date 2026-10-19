import {
  type Annotation,
  type TracePage,
  type Span,
  type Turn,
  FAIL_LABEL,
  PASS_LABEL,
  getGradeCriterion,
  getMatchedIssue,
  messageText,
  spanChildren,
  spanMessages,
} from "@grounded-intelligence/grounded-sdk";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUpRight, Check, Minus, X } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { z } from "zod";

import {
  counted,
  inputPreview,
  flatFields,
  formatJson,
  spanError,
  spanTiming,
  spanLabel,
  toolLabel,
  toolResult,
} from "#/traces";
import { Button, buttonVariants } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/ui/collapsible";
import { CopyButton } from "#/ui/copy-button";
import { flat } from "#/ui/format";
import { Markdown } from "#/ui/markdown";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import { formatDuration } from "#src/features/traces/duration";
import { TurnsTimeline } from "#src/features/traces/timeline";
import { type PartName, PartMark, SPANS_LINK, TurnNumber } from "#src/features/traces/turn-row";
import {
  ExpandAll,
  StepNotes,
  StepPlace,
  citationSources,
  openAt,
  useSessionParams,
} from "#src/features/traces/transcript";
import { CitationSources } from "#src/ui/citation";

type Label = { name: string; label: string };
export type Grade = Annotation & { criterion: string; step: string | undefined };

export { sessionTitle } from "#/titles";

/** A trace's input on one line, or its ID when the agent doesn't export content. */
export function traceTitle(trace: TracePage["traces"][number]) {
  return flat(messageText(trace.input)) || trace.trace_id;
}

/** Failed when any criterion fails, passed when one passes, and not graded otherwise. */
export function OutcomeTag({ annotations }: { annotations: readonly Label[] }) {
  if (annotations.some(({ label }) => label === FAIL_LABEL)) {
    return <Tag tone="danger">Failed</Tag>;
  }

  return annotations.some(({ label }) => label === PASS_LABEL) ? (
    <Tag tone="success">Passed</Tag>
  ) : (
    <Tag>Not graded</Tag>
  );
}

/** The Issues a session's traces match. */
export const issuesOf = (annotations: readonly Label[]) =>
  annotations.flatMap((annotation) => {
    const issue = getMatchedIssue(annotation);
    return issue === undefined ? [] : [issue];
  });

/** How many pass-or-fail Grades passed, as `2/4`, or nothing when there are none. */
export function GradeTally({ annotations }: { annotations: readonly Label[] }) {
  const graded = annotations.filter(
    (annotation) =>
      getGradeCriterion(annotation) !== undefined &&
      (annotation.label === PASS_LABEL || annotation.label === FAIL_LABEL),
  );
  const passed = graded.filter(({ label }) => label === PASS_LABEL).length;
  if (graded.length === 0) {
    return null;
  }

  return (
    <Tag tone={passed === graded.length ? "neutral" : "danger"}>
      {passed}/{graded.length}
    </Tag>
  );
}

const gradeRank = ({ label }: Label) => (label === FAIL_LABEL ? 0 : label === PASS_LABEL ? 2 : 1);

/** A session's Grades split into dimensions (grades with others nested under them) and criteria, failures first. */
export function sessionGrades(annotations: readonly Annotation[], turns: readonly Turn[]) {
  const views = turns.map(turnSpans);
  const failing = failingSteps(views, annotations);
  const grades: Grade[] = annotations.flatMap((annotation) => {
    const criterion = getGradeCriterion(annotation);
    const step =
      views.map((view) => annotatedStep(view, annotation)).find(Boolean) ??
      failingStep(failing, annotation);
    return criterion === undefined ? [] : [{ ...annotation, criterion, step }];
  });
  const isDimension = ({ criterion }: Grade) =>
    grades.some((other) => other.criterion.startsWith(`${criterion}/`));

  return {
    dimensions: grades.filter(isDimension),
    criteria: grades
      .filter((grade) => !isDimension(grade))
      .sort((a, b) => gradeRank(a) - gradeRank(b)),
  };
}

/** A Grade without a pass or fail label, as the grader scored it (`raw`) or else its `value`. */
export function scoreText({ label, value, raw }: Annotation) {
  if (label === PASS_LABEL || label === FAIL_LABEL) {
    return undefined;
  }
  if (raw === "") {
    return value === null ? undefined : String(value);
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const text = z.string().safeParse(parsed);
    return text.success ? text.data : JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

/** The criteria a session fails, with Grades named by their criterion. */
export const failedCriteria = (annotations: readonly Label[]) => [
  ...new Set(
    annotations.flatMap((annotation) =>
      annotation.label === FAIL_LABEL ? [getGradeCriterion(annotation) ?? annotation.name] : [],
    ),
  ),
];

export const operation = (span: Span) => span.attributes["gen_ai.operation.name"];

/** A turn's root, its spans by parent, the span holding its reply, and its top-level steps. */
export function turnSpans(turn: Turn) {
  const root = turn.spans.find((span) => span.parent_span_id === "");
  const children = spanChildren(turn.spans);
  // Spans whose parent wasn't exported sit under "" next to the root.
  const top = new Set([...(children.get(root?.span_id ?? "") ?? []), ...(children.get("") ?? [])]);
  const topLevel = turn.spans.filter((span) => span !== root && top.has(span));
  const last = topLevel.at(-1);
  const replying = last && operation(last) === "chat" ? last : root;
  const reply = replying && outputText(replying) ? replying : undefined;
  const prompt = root ? messageText(spanMessages(root, "gen_ai.input.messages")) : "";
  return { turn, root, children, topLevel, reply, prompt };
}

export type TurnSpans = ReturnType<typeof turnSpans>;

export const outputText = (span: Span) => messageText(spanMessages(span, "gen_ai.output.messages"));

const isFailing = (turn: Turn) => turn.annotations.some(({ label }) => label === FAIL_LABEL);

/** Each turn's failing parts by its trace, none for a passing turn. */
export function failingSteps(views: readonly TurnSpans[], annotations: readonly Annotation[]) {
  return new Map(
    views.map((view) => [
      view.turn.trace_id,
      isFailing(view.turn) ? failingParts(view, annotations) : [],
    ]),
  );
}

/** A failing annotation without a step of its own at its turn's first failing part, or the session's when it grades the session. */
function failingStep(
  failing: ReadonlyMap<string, readonly string[]>,
  { label, trace_id }: Label & { trace_id: string },
) {
  const parts =
    trace_id === "" ? [...failing.values()].find((each) => each.length > 0) : failing.get(trace_id);
  return label === FAIL_LABEL ? parts?.[0] : undefined;
}

/** A session's turns under a timeline, with failing steps marked in red and each step's reasoning under it. */
export function TraceTurns({
  annotations,
  turns,
  step,
}: {
  annotations: readonly Annotation[];
  turns: readonly Turn[];
  step?: string | undefined;
}) {
  const list = useRef<HTMLOListElement>(null);
  const views = turns.map(turnSpans);
  const { criteria } = sessionGrades(annotations, turns);
  const failing = failingSteps(views, annotations);
  const failures = [...failing.values()].flat();
  const marked = new Set(failures);
  const notes = stepNotes(views, annotations, failing);
  const [opened, setOpened] = useState(() => openAt(turns, step));
  const [failureAt, setFailureAt] = useState<number>();

  // `count` changes on every pick, so re-picking the same step still scrolls to it
  // and remounts it (via `key`), reopening it if the user collapsed it.
  const [picked, setPicked] = useState(step === undefined ? undefined : { id: step, count: 1 });
  const pick = (id: string) => {
    const view = views.find(
      ({ turn }) => turn.trace_id === id || turn.spans.some((span) => span.span_id === id),
    );
    if (view) {
      setOpened((open) => new Set(open).add(view.turn.trace_id));
    }
    setPicked({ id, count: (picked?.count ?? 0) + 1 });
  };
  const nextFailure = () => {
    const at = failureAt === undefined ? 0 : (failureAt + 1) % failures.length;
    const id = failures[at];
    if (id !== undefined) {
      setFailureAt(at);
      pick(id);
    }
  };

  useEffect(() => {
    if (picked) {
      list.current
        ?.querySelector(`[data-step="${CSS.escape(picked.id)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [picked]);

  return (
    <CitationSources value={citationSources(turns, pick)}>
      {criteria.length > 0 && <Grades grades={criteria} onPick={pick} />}
      <section aria-label="Turns" className="flex flex-col gap-2">
        <div className="sticky top-0 z-[1] flex items-start gap-3 border-b border-divider bg-surface py-3">
          <div className="min-w-0 flex-1">
            <TurnsTimeline
              turns={turns}
              failed={marked}
              open={opened}
              onPick={(span) => {
                const view = views.find(({ turn }) => turn.spans.includes(span));
                if (view) {
                  pick(stepOf(view, span));
                }
              }}
            />
          </div>
          {failures.length > 1 && (
            <Button variant="quiet" size="small" onClick={nextFailure} className="-my-2">
              <ArrowDown aria-hidden="true" className="size-3.5" />
              Next failure
              {failureAt !== undefined && (
                <span className="tabular-nums">
                  {failureAt + 1}/{failures.length}
                </span>
              )}
            </Button>
          )}
          <ExpandAll turns={turns} opened={opened} onOpen={setOpened} />
        </div>
        <ol ref={list} className="flex flex-col gap-1">
          {views.map((view) => (
            <li
              key={view.turn.trace_id}
              role="group"
              aria-label={`Turn ${view.turn.position}`}
              className="flex flex-col"
            >
              <Collapsible
                className="group/turn -mx-2 rounded-sm px-2 hover:bg-subtle data-[state=open]:bg-subtle data-[state=open]:pb-3"
                open={opened.has(view.turn.trace_id)}
                onOpenChange={(open) =>
                  setOpened((current) =>
                    open
                      ? new Set(current).add(view.turn.trace_id)
                      : new Set([...current].filter((id) => id !== view.turn.trace_id)),
                  )
                }
              >
                <div className="flex items-center gap-2">
                  <CollapsibleTrigger className="mr-0 h-auto min-h-7 flex-1 py-1">
                    <TurnNumber turn={view.turn} />
                    <span className="min-w-0 flex-1 truncate type-copy-14 font-medium text-ink group-aria-expanded/expand:whitespace-normal">
                      {flat(view.prompt)}
                    </span>
                    {isFailing(view.turn) && <Tag tone="danger">Failed</Tag>}
                    <span className="shrink-0 type-meta-12 text-muted tabular-nums">
                      {formatDuration(view.turn.duration_ns)}
                    </span>
                  </CollapsibleTrigger>
                  <SpanPageLink
                    trace={view.turn.trace_id}
                    className={cn(
                      SPANS_LINK,
                      "opacity-0 group-hover/turn:opacity-100 group-data-[state=open]/turn:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
                    )}
                  >
                    Spans
                    <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </SpanPageLink>
                </div>
                <CollapsibleContent className="pl-5.5">
                  <TurnParts view={view} marked={marked} picked={picked} notes={notes} />
                </CollapsibleContent>
              </Collapsible>
            </li>
          ))}
        </ol>
      </section>
    </CitationSources>
  );
}

/** The step a span sits in: itself or its nearest rendered ancestor, else the turn's message. */
function stepOf(view: TurnSpans, span: Span) {
  const spans = new Map(view.turn.spans.map((each) => [each.span_id, each]));
  for (let at: Span | undefined = span; at && at !== view.root; at = spans.get(at.parent_span_id)) {
    if (annotatedStep(view, at) !== undefined) {
      return at.span_id;
    }
  }
  return view.turn.trace_id;
}

/** Annotations with reasoning by the step they name; a failing turn's unplaced failures go under its first failing step. */
export function stepNotes(
  views: readonly TurnSpans[],
  annotations: readonly Annotation[],
  failing: ReadonlyMap<string, readonly string[]>,
) {
  const notes = new Map<string, Annotation[]>();
  for (const annotation of annotations) {
    const view = views.find(({ turn }) => turn.trace_id === annotation.trace_id);
    const step = (view && annotatedStep(view, annotation)) ?? failingStep(failing, annotation);
    if (step !== undefined && annotation.explanation) {
      notes.set(step, [...(notes.get(step) ?? []), annotation]);
    }
  }
  return notes;
}

export function SpanPageLink({
  trace,
  span,
  label,
  className,
  children,
}: {
  trace: string;
  span?: string;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const params = useSessionParams();
  return (
    <Link
      to="/$orgId/agents/$agent/traces/$session/$trace"
      params={{ ...params, trace }}
      search={span === undefined ? {} : { span }}
      aria-label={label}
      className={cn(buttonVariants({ variant: "quiet", size: "small" }), className)}
    >
      {children}
    </Link>
  );
}

/** Opens the span page on a step's span, shown while the step's line is hovered. */
function StepLink({ trace, span }: { trace: string; span: string }) {
  return (
    <Tooltip label="Open span">
      <SpanPageLink
        trace={trace}
        span={span}
        label="Open span"
        className="size-7 px-0 opacity-0 group-hover/line:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
      >
        <ArrowUpRight aria-hidden="true" className="size-3.5" />
      </SpanPageLink>
    </Tooltip>
  );
}

const MARKS = {
  [PASS_LABEL]: { Mark: Check, tone: "text-muted", word: "Passed" },
  [FAIL_LABEL]: { Mark: X, tone: "text-danger", word: "Failed" },
  score: { Mark: Minus, tone: "text-muted", word: "Scored" },
};

/** Each Grade with its mark and score, and its reasoning unless a step shows it. */
function Grades({ grades, onPick }: { grades: readonly Grade[]; onPick(id: string): void }) {
  return (
    <section aria-label="Grades" className="flex flex-col gap-1">
      <h2 className="flex h-7 items-center gap-2 type-label-13 font-semibold text-ink">
        Grades
        <GradeTally annotations={grades} />
      </h2>
      <ol className="flex flex-col">
        {grades.map((grade) => (
          <GradeRow key={gradeKey(grade)} grade={grade} onPick={onPick} />
        ))}
      </ol>
    </section>
  );
}

export const gradeKey = (grade: Annotation) =>
  `${grade.annotated_at}:${grade.span_id}:${grade.name}:${grade.source.id}`;

export function GradeRow({ grade, onPick }: { grade: Grade; onPick?: (id: string) => void }) {
  const { Mark, tone, word } =
    MARKS[grade.label === PASS_LABEL || grade.label === FAIL_LABEL ? grade.label : "score"];
  const score = scoreText(grade);
  const name = <span className="min-w-0 truncate">{grade.description || grade.criterion}</span>;
  const { step } = grade;
  return (
    <li className="flex min-w-0 gap-2.5 py-1">
      <Mark aria-hidden="true" strokeWidth={2.5} className={cn("mt-0.5 size-4 shrink-0", tone)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex min-h-5 min-w-0 items-center gap-2 type-label-13 text-ink">
          <span className="sr-only">{word}</span>
          {grade.description ? <Tooltip label={grade.criterion}>{name}</Tooltip> : name}
          {score !== undefined && <Tag>{score}</Tag>}
          {step !== undefined && onPick && (
            <Button variant="quiet" size="small" onClick={() => onPick(step)} className="ml-auto">
              <StepPlace step={step} />
            </Button>
          )}
        </p>
        {step === undefined && grade.explanation && (
          <p className="max-w-reading type-label-13 text-muted">{grade.explanation}</p>
        )}
      </div>
    </li>
  );
}

type Selection = {
  marked: ReadonlySet<string>;
  picked: { id: string; count: number } | undefined;
  notes: ReadonlyMap<string, readonly Annotation[]>;
};

function Unit({
  id,
  marked,
  picked,
  notes,
  children,
}: Selection & { id: string; children: ReactNode }) {
  return (
    <li
      data-step={id}
      aria-current={id === picked?.id ? "true" : undefined}
      className={cn(
        "relative scroll-mt-16",
        marked.has(id) &&
          "before:absolute before:inset-y-1 before:-left-3 before:w-0.5 before:rounded-full before:bg-danger",
      )}
    >
      {children}
      <StepNotes step={id} notes={notes.get(id)} />
    </li>
  );
}

function TurnParts({ view, ...selection }: Selection & { view: TurnSpans }) {
  const { turn, children, topLevel, reply } = view;
  const { picked } = selection;
  const steps = topLevel.filter((span) => span !== reply);
  const reasoning = reply && operation(reply) === "chat" ? modelText(reply)?.reasoning : undefined;
  const say = ({
    id,
    span,
    who,
    body,
    lead,
  }: {
    id: string;
    span: string | undefined;
    who: PartName;
    body: ReactNode;
    lead?: ReactNode;
  }) => (
    <Unit id={id} {...selection}>
      <Part
        who={who}
        action={span !== undefined && <StepLink trace={turn.trace_id} span={span} />}
        className={cn(id === picked?.id && "-mx-2 rounded-xs bg-fill px-2")}
      >
        {lead}
        <div className="max-w-reading">{body}</div>
      </Part>
    </Unit>
  );

  return (
    <ol aria-label={`Turn ${turn.position} parts`} className="flex flex-col">
      {/* the turn's row shows the user's message, so its step keeps only its anchor and notes */}
      <Unit id={turn.trace_id} {...selection}>
        {null}
      </Unit>
      {steps.length > 0 && (
        <li>
          <Part who="Agent steps">
            <WorkSummary view={view} steps={steps} {...selection}>
              <Steps
                label={`Turn ${turn.position} steps`}
                trace={turn.trace_id}
                spans={steps}
                children={children}
                {...selection}
              />
            </WorkSummary>
          </Part>
        </li>
      )}
      {reply &&
        say({
          id: reply.span_id,
          span: reply.span_id,
          who: "Agent response",
          body: <Markdown text={outputText(reply)} />,
          lead: reasoning && <TextStep label="Reasoning" text={reasoning} />,
        })}
    </ol>
  );
}

/** A turn's steps folded under one line, open when it holds a failure or the picked step. */
function WorkSummary({
  view: { turn, root, reply },
  steps,
  marked,
  picked,
  children,
}: Selection & { view: TurnSpans; steps: readonly Span[]; children: ReactNode }) {
  const inSteps = turn.spans.filter((span) => span !== root && span !== reply);
  const ids = new Set(inSteps.map((span) => span.span_id));
  const tools = inSteps.filter((span) => operation(span) === "execute_tool");
  const failed = tools.filter((span) => toolResult(span).failed).length;
  const holdsPick = picked !== undefined && ids.has(picked.id);
  const [open, setOpen] = useState(
    () =>
      holdsPick ||
      failed > 0 ||
      inSteps.some((span) => marked.has(span.span_id) || spanError(span) !== undefined),
  );
  const [seenPick, setSeenPick] = useState(picked?.count);
  if (holdsPick && picked.count !== seenPick) {
    setSeenPick(picked.count);
    setOpen(true);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="type-label-13 text-muted hover:text-ink">
        <span>Worked for {formatDuration(spanTiming(steps).total)}</span>
        {tools.length > 0 && <Tag>{counted(tools.length, "tool calls")}</Tag>}
        {failed > 0 && <Tag tone="danger">{failed} failed</Tag>}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-1.5 border-l border-divider pl-3.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function Steps({
  label,
  trace,
  spans,
  children,
  ...selection
}: Selection & {
  label: string;
  trace: string;
  spans: readonly Span[];
  children: Map<string, Span[]>;
}): ReactNode {
  const { marked, picked } = selection;
  const holdsPick = (span: Span) =>
    picked !== undefined && contains(children, span, new Set([picked.id]));
  // Remounting on each pick reopens a step the reader collapsed after an earlier pick
  const pickKey = (span: Span) =>
    span.span_id === picked?.id || holdsPick(span) ? (picked?.count ?? 0) : 0;
  const isOpen = (span: Span) =>
    span.span_id === picked?.id || contains(children, span, marked) || holdsPick(span);
  const nested = (span: Span) =>
    children.has(span.span_id) ? (
      <Steps
        label={`${label}, ${span.name}`}
        trace={trace}
        spans={children.get(span.span_id)!}
        children={children}
        {...selection}
      />
    ) : null;
  const link = (span: Span) => <StepLink trace={trace} span={span.span_id} />;

  return (
    <ol aria-label={label} className="@container flex flex-col">
      {spans.map((span) => {
        switch (operation(span)) {
          case "chat": {
            const text = modelText(span);
            return text ? (
              <Unit key={span.span_id} id={span.span_id} {...selection}>
                <ModelStep key={pickKey(span)} {...text} open={isOpen(span)} link={link(span)} />
              </Unit>
            ) : null;
          }
          case "execute_tool":
            return (
              <Unit key={span.span_id} id={span.span_id} {...selection}>
                <ToolStep
                  key={pickKey(span)}
                  span={span}
                  open={isOpen(span)}
                  selected={span.span_id === picked?.id}
                  link={link(span)}
                >
                  {nested(span)}
                </ToolStep>
              </Unit>
            );
          case "invoke_agent":
            return (
              <li key={span.span_id}>
                <Collapsible key={pickKey(span)} defaultOpen={isOpen(span)}>
                  <div className="group/line flex items-center">
                    <CollapsibleTrigger className="mr-0 flex-1">
                      <span className="min-w-0 truncate type-label-13 font-medium text-ink">
                        {spanLabel(span)}
                      </span>
                      <Tag>Agent</Tag>
                      <span className="ml-auto shrink-0 type-meta-12 text-muted tabular-nums">
                        {formatDuration(span.duration_ns)}
                      </span>
                    </CollapsibleTrigger>
                    {link(span)}
                  </div>
                  <CollapsibleContent className="pl-5.5">{nested(span)}</CollapsibleContent>
                </Collapsible>
              </li>
            );
          default:
            return children.has(span.span_id) ? <li key={span.span_id}>{nested(span)}</li> : null;
        }
      })}
    </ol>
  );
}

function contains(children: Map<string, Span[]>, span: Span, ids: ReadonlySet<string>): boolean {
  return (children.get(span.span_id) ?? []).some(
    (child) => ids.has(child.span_id) || contains(children, child, ids),
  );
}

function Part({
  who,
  action,
  className,
  children,
}: {
  who: PartName;
  action?: ReactNode;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={cn("group/line flex items-start gap-3 py-1", className)}>
      <PartMark who={who} />
      <div className="min-w-0 flex-1 basis-64">{children}</div>
      {action}
    </div>
  );
}

export function modelText(span: Span) {
  const parts = spanMessages(span, "gen_ai.output.messages").flatMap((message) => message.parts);
  const text = (type: string) =>
    parts.flatMap((part) => (part.type === type && part.content ? [part.content] : [])).join("");
  const reasoning = text("reasoning");
  const reply = text("text");
  return reasoning || reply ? { reasoning, reply } : undefined;
}

/** A model step as its reasoning and its message, each a line that opens to the full text. */
function ModelStep({
  reasoning,
  reply,
  open,
  link,
}: {
  reasoning: string;
  reply: string;
  open: boolean;
  link: ReactNode;
}) {
  return (
    <>
      {reasoning && <TextStep label="Reasoning" text={reasoning} open={open} link={link} />}
      {reply && <TextStep label="Message" text={reply} open={open} link={link} />}
    </>
  );
}

/** Model text as one line with its start, opening to the full text. */
export function TextStep({
  label,
  text,
  open = false,
  link,
}: {
  label: string;
  text: string;
  open?: boolean;
  link?: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={open}>
      <div className="group/line flex items-center">
        <CollapsibleTrigger className="mr-0 flex-1">
          <span className="shrink-0 type-label-13 font-medium text-ink">{label}</span>
          <span className="min-w-0 flex-1 truncate type-label-13 text-muted group-aria-expanded/expand:invisible">
            {flat(text)}
          </span>
        </CollapsibleTrigger>
        {link}
      </div>
      <CollapsibleContent className="max-w-reading pb-2 pl-5.5">
        <Markdown text={text} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A tool call as one line with its main argument, opening to its input and output. */
function ToolStep({
  span,
  open,
  selected,
  link,
  children,
}: {
  span: Span;
  open: boolean;
  selected: boolean;
  link: ReactNode;
  children: ReactNode;
}) {
  const name = span.attributes["gen_ai.tool.name"] ?? span.name;
  return (
    <Collapsible defaultOpen={open}>
      <div className="group/line flex items-center">
        <CollapsibleTrigger className={cn("mr-0 flex-1", selected && "row-selected")}>
          <span title={name} className="shrink-0 type-label-13 font-medium text-ink">
            {toolLabel(name)}
          </span>
          <span className="min-w-0 flex-1 truncate type-label-13 text-muted">
            {inputPreview(span)}
          </span>
          <ResultTag span={span} />
          <span className="shrink-0 type-meta-12 text-muted tabular-nums">
            {formatDuration(span.duration_ns)}
          </span>
        </CollapsibleTrigger>
        {link}
      </div>
      <CollapsibleContent className="pb-2 pl-5.5">
        <ToolCall span={span} />
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ResultTag({ span }: { span: Span }) {
  const { text, failed } = toolResult(span);
  return failed ? <Tag tone="danger">{text}</Tag> : null;
}

/** A tool call's input and output, side by side when there's room. */
export function ToolCall({ span }: { span: Span }) {
  const input = span.attributes["gen_ai.tool.call.arguments"];
  const output = span.attributes["gen_ai.tool.call.result"] ?? spanError(span);
  return (
    <div className="grid gap-2 pt-1 @2xl:grid-cols-2">
      {input && <CallPayload label="Input" text={input} />}
      {output && <CallPayload label="Output" text={output} />}
    </div>
  );
}

const PREVIEW_LINES = 12;

/** A flat JSON object as labelled fields, other JSON indented, and long text cut until Show more. */
function CallPayload({ label, text }: { label: string; text: string }) {
  const [more, setMore] = useState(false);
  const fields = flatFields(text);
  const body = formatJson(text);
  const lines = body.split("\n");
  const long = lines.length > PREVIEW_LINES;
  return (
    <section aria-label={label} className="flex min-w-0 flex-col rounded-sm bg-fill">
      <header className="flex h-8 shrink-0 items-center justify-between pr-1 pl-3">
        <p className="type-meta-12 font-medium text-muted">{label}</p>
        <CopyButton label={`Copy ${label.toLowerCase()}`} text={body} />
      </header>
      {fields ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 pb-2 type-mono-12">
          {Object.entries(fields).map(([key, field]) => (
            <Fragment key={key}>
              <dt className="text-muted">{key}</dt>
              <dd className="whitespace-pre-wrap wrap-anywhere text-ink">{String(field)}</dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        <pre className="overflow-x-auto px-3 pb-2 type-mono-12 whitespace-pre-wrap wrap-anywhere text-muted">
          <Json text={more || !long ? body : lines.slice(0, PREVIEW_LINES).join("\n")} />
        </pre>
      )}
      {long && !fields && (
        <Button
          variant="quiet"
          size="small"
          onClick={() => setMore(!more)}
          className="mb-1 ml-1 self-start"
        >
          {more ? "Show less" : "Show more"}
        </Button>
      )}
    </section>
  );
}

const TOKEN = /"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/gu;

/** JSON with keys and values in ink over grey punctuation. */
function Json({ text }: { text: string }) {
  let last = 0;
  const parts: ReactNode[] = [];
  for (const { 0: token, index } of text.matchAll(TOKEN)) {
    const end = index + token.length;
    parts.push(
      text.slice(last, index),
      <span key={index} className="text-ink">
        {token}
      </span>,
    );
    last = end;
  }
  return [...parts, text.slice(last)];
}

/** The step of a turn a span names, when the turn renders it: its reply, a tool call, or a model step with text. */
function annotatedStep({ turn, reply }: TurnSpans, { span_id }: { span_id: string }) {
  const span = turn.spans.find((candidate) => candidate.span_id === span_id);
  const rendered =
    span !== undefined &&
    (span === reply ||
      operation(span) === "execute_tool" ||
      (operation(span) === "chat" && modelText(span) !== undefined));
  return rendered ? span.span_id : undefined;
}

/** A failing turn's steps that failing annotations name, else its errored tool calls, else its reply. */
function failingParts(view: TurnSpans, annotations: readonly Annotation[]) {
  const { turn, reply } = view;
  const annotated = annotations.flatMap((annotation) => {
    const step =
      annotation.label === FAIL_LABEL && annotation.trace_id === turn.trace_id
        ? annotatedStep(view, annotation)
        : undefined;
    return step === undefined ? [] : [step];
  });
  if (annotated.length > 0) {
    return annotated;
  }

  const errored = turn.spans.filter(
    (span) => operation(span) === "execute_tool" && spanError(span) !== undefined,
  );
  return (errored.length ? errored : reply ? [reply] : []).map((span) => span.span_id);
}
