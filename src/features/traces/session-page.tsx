// what the session page adds to platform's: the step a link opens at, the Steps and Flow switch, a crumb that fits, and
// what Pebble reads about the page
import { useNavigate, useSearch } from "@tanstack/react-router";

import { type Grade, failedCriteria } from "#/trace-view";
import { SegmentedControl } from "#/ui/segmented-control";
import { FAIL_LABEL } from "#src/sdk/evals";

const SESSION = "/$orgId/agents/$agent/traces/$session/";

const VIEWS = [
  { value: "steps", label: "Steps" },
  { value: "flow", label: "Flow" },
] as const;

/** The transcript's step and view, kept in the session page's URL. */
export function useSessionView() {
  const { step, view } = useSearch({ from: SESSION });
  const navigate = useNavigate({ from: SESSION });
  return {
    step,
    view: view ?? ("steps" as const),
    onView: (next: "steps" | "flow") =>
      void navigate({
        search: (previous) => ({ ...previous, view: next === "flow" ? next : undefined }),
      }),
  };
}

/** The Steps and Flow switch; Ask Pebble sits beside the failure itself. */
export function TraceViewBar({
  view,
  onView,
}: {
  view: "steps" | "flow";
  onView(view: "steps" | "flow"): void;
}) {
  return (
    <SegmentedControl
      label="Trace view"
      value={view}
      segments={VIEWS}
      onChange={onView}
      className="self-start"
    />
  );
}

// Trace annotation's own pass or fail, which the Outcome tag already shows
const OUTCOME = "outcome";

/** The criteria a session fails that no Grade shows, beside its Outcome tag. */
export const otherFailures = (
  labels: ReadonlyArray<{ name: string; label: string }>,
  graded: ReadonlySet<string>,
) => failedCriteria(labels.filter(({ name }) => !graded.has(name) && name !== OUTCOME));

const TRACE_PROMPTS = ["Why did this trial fail?", "Which step should I look at first?"];

/** What Pebble reads about the session page, and its suggested prompts. */
export function sessionPebblePage({
  session,
  task,
  title,
  criteria,
}: {
  session: string;
  task: string | undefined;
  title: string;
  criteria: readonly Grade[];
}): [string, string[]] {
  const failing = criteria.filter(({ label }) => label === FAIL_LABEL);
  const fails =
    failing.length === 0
      ? ""
      : ` It fails ${failing.map((grade) => `"${grade.description || grade.criterion}" (${grade.explanation || "no reasoning given"})`).join(", ")}.`;
  return [
    `The engineer is viewing Trace session ${session}${task ? `, a trial of the Eval ${task}` : ""}: "${title}".${fails}`,
    TRACE_PROMPTS,
  ];
}
