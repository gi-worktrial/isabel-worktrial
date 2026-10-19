// where a session fails: each step's place in words ("RunEditorCommand in Turn 5"), shared by the failure row, the
// Grades' jumps, the notes' Ask Pebble and trial Compare, and the one-line failure summary atop a failed Trace
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import {
  type Grade,
  type TurnSpans,
  failingSteps,
  modelText,
  operation,
  stepNotes,
  turnSpans,
} from "#/trace-view";
import { spanLabel } from "#/traces";
import { Button } from "#/ui/button";
import { StepPlaces } from "#src/features/traces/transcript";
import type { Annotation, Span, Turn } from "#src/sdk/agents";
import { FAIL_LABEL } from "#src/sdk/evals";

/** A step's name as its turn reads it, such as a tool's name, "Message" or "Agent response". */
export function stepName(view: TurnSpans, span: Span) {
  if (span === view.reply) {
    return "Agent response";
  }
  if (operation(span) === "execute_tool") {
    return spanLabel(span);
  }
  return modelText(span)?.reply ? "Message" : "Reasoning";
}

/** Every step marked failing across a session's turns, from `failingSteps`. */
export const markedSteps = (failing: ReadonlyMap<string, readonly string[]>) =>
  new Set([...failing.values()].flat());

type StepLocation = { id: string; turn: number; name: string };

/** Where a Grade points in the trace, with its turn and the step's name, when it points at a step. */
export function gradeLocation(
  views: readonly TurnSpans[],
  { step }: Pick<Grade, "step">,
): StepLocation | undefined {
  for (const view of views) {
    const span = view.turn.spans.find(({ span_id }) => span_id === step);
    if (span !== undefined) {
      return { id: span.span_id, turn: view.turn.position, name: stepName(view, span) };
    }
  }
  return undefined;
}

/** A location's words, naming its turn only when the session has several. */
export const locationText = ({ name, turn }: StepLocation, turns: number) =>
  turns > 1 ? `${name} in Turn ${turn}` : name;

/** Names each step of `turns` for the transcript's Grades and notes inside it. */
export function StepPlacesOf({ turns, children }: { turns: readonly Turn[]; children: ReactNode }) {
  const views = turns.map(turnSpans);
  const place = (step: string) => {
    const location = gradeLocation(views, { step });
    return location && locationText(location, views.length);
  };
  return <StepPlaces value={place}>{children}</StepPlaces>;
}

const failedWithReason = ({ label, explanation }: Annotation) =>
  label === FAIL_LABEL && explanation !== "";

type Failure = StepLocation & {
  place: string;
  reasoning: string | undefined;
  more: number;
};

/** A session's first failing step, why it fails, and how many more fail after it, or nothing when none does. */
export function failureOf(
  annotations: readonly Annotation[],
  turns: readonly Turn[],
): Failure | undefined {
  const views = turns.map(turnSpans);
  const failing = failingSteps(views, annotations);
  const steps = [...failing.values()].flat();
  const location = gradeLocation(views, { step: steps[0] });
  if (location === undefined) {
    return undefined;
  }
  const notes = stepNotes(views, annotations, failing).get(location.id) ?? [];
  return {
    ...location,
    place: locationText(location, views.length),
    reasoning: (notes.find(failedWithReason) ?? annotations.find(failedWithReason))?.explanation,
    more: steps.length - 1,
  };
}

/** A failure on one line: where it failed, how many more fail, why, and the actions at the right, wrapping in a narrow pane. */
export function FailureLine({
  failure,
  turns,
  children,
}: {
  failure: Failure;
  turns: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 type-label-13">
      <X aria-hidden="true" strokeWidth={2.5} className="size-4 shrink-0 text-danger" />
      <p className="shrink-0 font-medium text-ink">
        {turns > 1
          ? `Failed in Turn ${failure.turn} at ${failure.name}`
          : `Failed at ${failure.name}`}
      </p>
      {failure.more > 0 && <p className="shrink-0 text-muted">and {failure.more} more</p>}
      <p title={failure.reasoning} className="min-w-0 flex-1 basis-48 truncate text-muted">
        {failure.reasoning}
      </p>
      {children !== undefined && (
        <div className="ml-auto flex shrink-0 items-center gap-1">{children}</div>
      )}
    </div>
  );
}

/** The failure atop a failed Trace on a red tint, with Go to step (the step itself offers Ask Pebble); nothing when no step fails. */
export function FailureSummary({
  annotations,
  turns,
}: {
  annotations: readonly Annotation[];
  turns: readonly Turn[];
}) {
  const navigate = useNavigate({ from: "/$orgId/agents/$agent/traces/$session/" });
  const failure = failureOf(annotations, turns);
  return failure === undefined ? null : (
    <section aria-label="Failure" className="rounded-sm bg-danger-tint px-3 py-1">
      <FailureLine failure={failure} turns={turns.length}>
        <Button
          variant="quiet"
          size="small"
          onClick={() =>
            void navigate({
              search: (previous) => ({ ...previous, step: failure.id, view: undefined }),
            })
          }
        >
          Go to step
        </Button>
      </FailureLine>
    </section>
  );
}
