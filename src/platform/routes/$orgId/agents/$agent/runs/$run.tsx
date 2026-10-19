import type { EvalRun, JobRun } from "@grounded-intelligence/grounded-sdk";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { automationsQuery, runQuery, runsKey, stepLogQuery } from "#/queries";
import { Link, createFileRoute, useRouteContext } from "@tanstack/react-router";
import { Circle, CircleCheck, CircleMinus, CircleStop, CircleX, LoaderCircle } from "lucide-react";
import { z } from "zod";

import { RunDuration, RUN_TRIGGER_LABELS } from "../../../../../automations";
import { jobTitle } from "#/titles";
import { RunStatusTag } from "#/run-status";
import { Button } from "#/ui/button";
import { GradeTally, OutcomeTag } from "#/trace-view";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/ui/collapsible";
import { EmptyState } from "#/ui/empty-state";
import { Fact, Facts } from "#/ui/facts";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import { type Crumb, crumbs } from "#/crumbs";
import { usePebblePage } from "#src/features/pebble/page";
import { RunTrials, runPebblePage } from "#src/features/traces/run-pages";
import { TRIALS_SEARCH } from "#src/features/traces/search";
import { LinesSkeleton } from "#src/ui/skeleton";
import { TimeTag } from "#src/ui/time-tag";

type Params = { orgId: string; agent: string; run: string };
type Step = JobRun["steps"][number];

export const Route = createFileRoute("/$orgId/agents/$agent/runs/$run")({
  validateSearch: z.object(TRIALS_SEARCH),
  loader: async ({ context: { queryClient }, params }) => {
    const [{ run }, automations] = await Promise.all([
      queryClient.ensureQueryData(runQuery(params)),
      queryClient.ensureQueryData(automationsQuery(params)),
    ]);
    const job = automations.find((row) => row.job.name === run.job)?.job;
    const trail: Crumb[] = [{ label: "Automations", to: "/$orgId/agents/$agent/automations" }];
    if (job !== undefined) {
      trail.push({
        label: jobTitle(job),
        to: "/$orgId/agents/$agent/jobs/$job",
        params: { job: job.name },
      });
    }
    trail.push({ label: `Run ${run.id.slice(0, 8)}`, to: "/$orgId/agents/$agent/runs/$run" });
    return crumbs(...trail);
  },
  component: RunPage,
});

function RunPage() {
  const params = Route.useParams();
  const { run, output } = useSuspenseQuery(runQuery(params)).data;
  usePebblePage(...runPebblePage(run, output));

  return (
    <article aria-label="Run" className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="flex min-w-0 flex-1 basis-64 items-center gap-3 type-title-18 text-ink">
            {`Run ${run.id.slice(0, 8)}`}
            <RunStatusTag run={run} />
          </h1>
          <CancelRunButton params={params} run={run} />
        </div>
        <Facts label="Run details">
          <Fact label="Trigger">{RUN_TRIGGER_LABELS[run.trigger]}</Fact>
          <Fact label="Ref">
            <Tooltip label={run.sha}>
              <Tag tabIndex={0}>{run.ref.replace(/^refs\/heads\//, "")}</Tag>
            </Tooltip>
          </Fact>
          <Fact label="Started">
            <TimeTag at={run.created_at} />
          </Fact>
          {run.completed_at !== null && (
            <Fact label="Duration">
              <Tag><RunDuration run={run} /></Tag>
            </Fact>
          )}
          {run.dry_run && (
            <Fact label="Definition">
              <Tag tone="warning">Dry run</Tag>
            </Fact>
          )}
        </Facts>
        {run.error !== null && (
          <p role="alert" className="type-label-13 whitespace-pre-wrap text-danger">
            {run.error}
          </p>
        )}
      </header>
      <section aria-label="Steps" className="flex flex-col gap-2">
        <h2 className="type-heading-15 text-ink">Steps</h2>
        <ol className="card flex flex-col divide-y divide-divider">
          {run.steps.map((step) => (
            <RunStep key={step.number} params={params} step={step} />
          ))}
        </ol>
      </section>
      {output !== undefined && <EvalResults params={params} results={output} />}
    </article>
  );
}

/** Cancels a queued or in-progress run, like GitHub's "Cancel workflow". */
function CancelRunButton({ params, run }: { params: Params; run: JobRun }) {
  const { client } = useRouteContext({ from: "/$orgId" });
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => client.jobs.cancelRun({ agent: params.agent, run: run.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: runsKey(params) }),
  });
  if (run.phase !== "queued" && run.phase !== "preparing" && run.phase !== "running") {
    return null;
  }

  const error = cancel.error?.message;
  return (
    <div className="flex items-center gap-3">
      {error !== undefined && (
        <p role="alert" className="type-label-13 text-danger">
          {error}
        </p>
      )}
      <Button
        disabled={cancel.isPending || run.cancel_requested_at !== null}
        onClick={() => cancel.mutate()}
      >
        <CircleStop className="size-4" />
        Cancel run
      </Button>
    </div>
  );
}

function RunStep({ params, step }: { params: Params; step: Step }) {
  return (
    <li className="px-4 py-1">
      <Collapsible
        defaultOpen={step.status === "in_progress" || step.conclusion === "failure"}
        disabled={step.status === "queued"}
      >
        <CollapsibleTrigger className="mx-0 w-full px-0 type-label-13 text-ink disabled:text-muted">
          <StepIcon step={step} />
          <span className="min-w-0 flex-1 truncate">{step.name}</span>
          {step.conclusion === "skipped" && <span className="text-muted">Skipped</span>}
          {step.started_at !== null && step.completed_at !== null && (
            <span className="type-meta-12 text-muted tabular-nums">
              {`${Math.round((Date.parse(step.completed_at) - Date.parse(step.started_at)) / 1000)} s`}
            </span>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-2">
          <StepLog params={params} step={step} />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function StepIcon({ step }: { step: Step }) {
  if (step.status === "queued") {
    return <Circle className="size-3.5 shrink-0 text-muted" />;
  }
  if (step.status === "in_progress") {
    return <LoaderCircle className="size-3.5 shrink-0 animate-spin text-accent" />;
  }
  if (step.conclusion === "success") {
    return <CircleCheck className="size-3.5 shrink-0 text-success" />;
  }

  return step.conclusion === "skipped" || step.conclusion === "cancelled" ? (
    <CircleMinus className="size-3.5 shrink-0 text-muted" />
  ) : (
    <CircleX className="size-3.5 shrink-0 text-danger" />
  );
}

function StepLog({ params, step }: { params: Params; step: Step }) {
  const log = useQuery({ ...stepLogQuery({ ...params, step }), placeholderData: keepPreviousData });
  const text = log.data?.text;
  if (text === undefined && log.error === null) {
    return <LinesSkeleton label={`Loading ${step.name} log`} className="p-2" />;
  }

  return (
    <pre
      aria-label={`${step.name} log`}
      className="max-h-96 overflow-auto rounded-xs bg-fill p-2 type-mono-12 whitespace-pre-wrap text-ink"
    >
      {log.error !== null ? (
        <span className="text-danger">{log.error.message}</span>
      ) : text === "" ? (
        <span className="text-muted">No output</span>
      ) : (
        text
      )}
    </pre>
  );
}

function EvalResults({ params, results }: { params: Params; results: EvalRun["results"] }) {
  const { orgId, agent } = params;

  return (
    <section aria-label="Eval results" className="flex flex-col gap-2">
      <h2 className="type-heading-15 text-ink">Eval results</h2>
      <RunTrials params={params} results={results} />
      <div className="card overflow-clip">
        <table className="record-table">
          <thead>
            <tr>
              <th className="w-full">Eval</th>
              <th>Grades</th>
              <th>Outcome</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {results.flatMap(({ eval: id, trials }) =>
              trials.map((trial) => (
                <tr key={trial.trace_id}>
                  <td className="max-w-0 text-ink">
                    <Link
                      to="/$orgId/agents/$agent/traces/$session"
                      params={{ orgId, agent, session: trial.session_id }}
                      className="row-action block truncate"
                    >
                      {id}
                    </Link>
                  </td>
                  <td>
                    <GradeTally annotations={trial.annotations} />
                  </td>
                  <td>
                    <OutcomeTag annotations={trial.annotations} />
                  </td>
                  <td className="whitespace-nowrap">
                    <TimeTag at={trial.started_at} />
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        {results.length === 0 && (
          <EmptyState
            title="No trials yet"
            description="Trials show here once the run publishes them."
          />
        )}
      </div>
    </section>
  );
}
