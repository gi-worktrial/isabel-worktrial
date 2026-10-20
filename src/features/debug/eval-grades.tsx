import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";

import { criterionTitle } from "#/evals";
import { useIssueParams } from "#/issue-view";
import { usePebbleDock } from "#/pebble/page";
import { sessionQuery } from "#/queries";
import { Button, buttonVariants } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/ui/collapsible";
import { EmptyState } from "#/ui/empty-state";
import { PebbleMark } from "#/ui/marks";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import { useRunEvals } from "#src/features/candidates/proofs-view";
import { gradeOutcomes } from "#src/features/debug/grades";
import { AddEvals } from "#src/features/debug/new-eval";
import { GradesSkeleton } from "#src/features/debug/skeletons";
import { TraceTurns } from "#src/features/traces/trace-view";
import type { CandidateSummary, EvalResult, JobRun, RegisteredEval } from "#src/sdk/index";
import { ErrorView } from "#src/ui/error-view";
import { FOLD } from "#src/ui/fold";
import { LinesSkeleton } from "#src/ui/skeleton";

/** A run's Evals, failing first: each one's Grades at once, its trial Traces a click on its row away. */
function EvalGrades({
  run,
  regressions = [],
  ask,
  empty,
}: {
  /** The newest full run, undefined before the first. */
  run: JobRun | undefined;
  regressions?: readonly string[] | undefined;
  /** The question a failing Eval's Ask Pebble starts with. */
  ask(title: string): string;
  empty: ReactNode;
}) {
  const params = useIssueParams();
  const pebble = usePebbleDock();
  const evals = useRunEvals(run);

  if (run === undefined) {
    return <div className="p-3">{empty}</div>;
  }
  if (evals.error !== null) {
    return (
      <div className="p-3">
        <ErrorView
          title="These Grades could not load"
          error={evals.error}
          onRetry={() => void evals.refetch()}
        />
      </div>
    );
  }
  if (evals.data === undefined) {
    return <GradesSkeleton />;
  }

  const { evals: registry, results } = evals.data;
  if (results.length === 0 && run.status !== "completed") {
    return <GradesSkeleton />;
  }
  if (results.length === 0) {
    return (
      <div className="p-3">
        <EmptyState
          title={run.status === "completed" ? "No Grades in this run" : "Evals are running"}
          description={
            run.status === "completed"
              ? "Trials show here once the run publishes them."
              : "Grades show here as each Eval finishes."
          }
        />
      </div>
    );
  }

  const newEvals = registry.filter(({ issues }) => issues.includes(params.issue));
  return (
    <div className="flex flex-col">
      {newEvals.length === 0 && (
        <div className="flex items-center gap-3 border-b border-divider px-3 py-2 type-label-13 text-muted">
          <span className="min-w-0 flex-1">
            No Evals selected for this Issue, so nothing checks the fix yet.
          </span>
          <AddEvals variant="outline" />
        </div>
      )}
      <ol aria-label="Evals" className="flex flex-col py-1">
        {results.map((result) => (
          <EvalRow
            key={result.eval}
            result={result}
            entry={registry.find(({ id }) => id === result.eval)}
            isNew={newEvals.some(({ id }) => id === result.eval)}
            regressed={regressions.includes(result.eval)}
            onAsk={(title) => pebble.prefill(ask(title))}
          />
        ))}
      </ol>
    </div>
  );
}

/** A Candidate's newest run's Grades, for Debug's Grades tab. */
export function CandidateGrades({
  candidate,
  pending = false,
}: {
  candidate: CandidateSummary;
  pending?: boolean;
}) {
  if (pending) {
    return <GradesSkeleton />;
  }
  return (
    <EvalGrades
      run={candidate.results?.run}
      regressions={candidate.results?.regressions}
      ask={(title) =>
        `Why does the Candidate "${candidate.title}" fail the Eval "${title}", and how can it pass? `
      }
      empty={
        <EmptyState
          title="Not run yet"
          description="Grades show here once this Candidate's Evals run. Saving an edit runs them."
        />
      }
    />
  );
}

/** The evals branch's baseline run's Grades, for Debug Evals' Grades tab. */
export function BaselineGrades({ run }: { run: JobRun | null }) {
  return (
    <EvalGrades
      run={run ?? undefined}
      ask={(title) =>
        `Does the Eval "${title}" check the right thing for this Issue? Its baseline run fails it. `
      }
      empty={
        <EmptyState
          title="Not run yet"
          description="Grades show here once the evals branch runs. Saving an edit runs it."
        />
      }
    />
  );
}

// one line per Eval with its Criteria passed and only its failing Grades under it, folding open into every Grade and
// its trials' Traces, its mark giving way to the chevron and Ask Pebble showing on hover
function EvalRow({
  result,
  entry,
  isNew,
  regressed,
  onAsk,
}: {
  result: EvalResult;
  entry: RegisteredEval | undefined;
  isNew: boolean;
  regressed: boolean;
  onAsk(title: string): void;
}) {
  const title = entry?.title ?? result.eval;
  const grades = gradeOutcomes(result.trials);
  const failing = grades.filter(({ passed }) => !passed);
  const Mark = result.passed ? Check : X;

  return (
    <Collapsible asChild>
      <li className="group/row flex flex-col">
        <div className="flex h-9 min-w-0 items-center gap-2 pr-3 hover:bg-subtle">
          <CollapsibleTrigger
            className="focus-inset mx-0 h-9 min-w-0 flex-1 rounded-none pl-3 hover:bg-transparent"
            mark={
              <Mark
                aria-hidden="true"
                strokeWidth={2.5}
                className={cn("size-4", result.passed ? "text-success" : "text-danger")}
              />
            }
          >
            <span className="sr-only">{result.passed ? "Passed" : "Failed"}</span>
            <span
              className="min-w-0 truncate type-label-13 font-medium text-ink"
              title={result.eval}
            >
              {title}
            </span>
            {isNew && <Tag>New</Tag>}
            {regressed && <Tag tone="danger">Regressed</Tag>}
          </CollapsibleTrigger>
          {grades.length > 0 && (
            <Tooltip label="Criteria passed">
              <span
                className={cn(
                  "shrink-0 type-meta-12 tabular-nums",
                  failing.length === 0 ? "text-muted" : "text-danger",
                )}
              >
                {grades.length - failing.length}/{grades.length}
              </span>
            </Tooltip>
          )}
          {!result.passed && (
            <Tooltip label="Open Pebble with a question about this Eval">
              <Button
                size="small"
                variant="quiet"
                className="opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100"
                onClick={() => onAsk(title)}
              >
                <PebbleMark />
                Ask Pebble
              </Button>
            </Tooltip>
          )}
        </div>
        {failing.length > 0 && (
          <GradeList label={`${title} failing Grades`} grades={failing} entry={entry} />
        )}
        <CollapsibleContent className={FOLD}>
          <div className="flex flex-col gap-4 pr-3 pb-4 pl-9">
            {grades.length > 0 && (
              <GradeList label={`${title} Grades`} grades={grades} entry={entry} inset={false} />
            )}
            {result.trials.map((trial, index) => (
              <section
                key={trial.trace_id}
                aria-label={`Trial ${index + 1}`}
                className="flex flex-col gap-2"
              >
                {result.trials.length > 1 && (
                  <h3 className="type-label-13 font-semibold text-ink">Trial {index + 1}</h3>
                )}
                <TrialTrace session={trial.session_id} />
              </section>
            ))}
          </div>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}

// Grades one per line, read by their Criterion's description with the registry name in the tooltip
function GradeList({
  label,
  grades,
  entry,
  inset = true,
}: {
  label: string;
  grades: ReturnType<typeof gradeOutcomes>;
  entry: RegisteredEval | undefined;
  inset?: boolean;
}) {
  return (
    <ul aria-label={label} className={cn("flex flex-col gap-1", inset && "-mt-1 pr-3 pb-2 pl-9")}>
      {grades.map(({ criterion, passed }) => {
        const description = entry?.criteria.find(({ name }) => name === criterion)?.description;
        const GradeMark = passed ? Check : X;
        return (
          <li
            key={criterion}
            className={cn(
              "flex min-w-0 items-center gap-1 type-meta-12",
              passed ? "text-muted" : "text-danger",
            )}
          >
            <GradeMark aria-label={passed ? "Passed" : "Failed"} className="size-3 shrink-0" />
            <Tooltip label={criterion}>
              <span className="truncate">{description || criterionTitle(criterion)}</span>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

function TrialTrace({ session }: { session: string }) {
  const { orgId, agent } = useIssueParams();
  const trace = useQuery(sessionQuery({ orgId, agent, session, after: undefined }));
  if (trace.error !== null) {
    return (
      <ErrorView
        title="This Trace could not load"
        error={trace.error}
        onRetry={() => void trace.refetch()}
      />
    );
  }
  if (trace.data === undefined) {
    return <LinesSkeleton lines={4} label="Loading Trace" />;
  }

  return (
    <>
      <TraceTurns
        params={{ orgId, agent, session }}
        annotations={trace.data.annotations}
        turns={trace.data.page.turns}
      />
      <Link
        to="/$orgId/agents/$agent/traces/$session"
        params={{ orgId, agent, session }}
        className={cn(buttonVariants({ variant: "quiet", size: "small" }), "self-start")}
      >
        Open Trace
      </Link>
    </>
  );
}
