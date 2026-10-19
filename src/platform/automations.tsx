import type { Job, JobRun } from "@grounded-intelligence/grounded-sdk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, GitBranch, Play } from "lucide-react";

import { describeSchedule, shortSchedule } from "./cron";
import { automationsQuery, RUNS_PAGE_SIZE, runsKey } from "./queries";
import { RunStatusTag } from "./run-status";
import { jobTitle } from "./titles";
import { Button, IconButton } from "#/ui/button";
import { PageLink } from "#/ui/page-link";
import { EmptyState } from "#/ui/empty-state";
import { formatDuration } from "#/ui/format";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import { TimeTag } from "#src/ui/time-tag";

type ActiveJob = Extract<Job, { state: "active" }>;
type Params = { orgId: string; agent: string };

const NANOS_PER_MILLI = 1_000_000;

export const RUN_TRIGGER_LABELS: Record<JobRun["trigger"], string> = {
  workflow_dispatch: "Manual",
  push: "Push",
  pull_request: "Pull request",
  schedule: "Schedule",
};

export { jobTitle };

const TRIGGERS = ["schedule", "push", "pull_request", "workflow_dispatch"] as const;

/** A tag per trigger, each followed by a tag per branch it runs on. */
export function JobTriggers({ on }: { on: ActiveJob["on"] }) {
  return TRIGGERS.flatMap((trigger) => {
    if (on[trigger] === undefined) {
      return [];
    }

    const branches =
      trigger === "push" || trigger === "pull_request" ? on[trigger]?.branches : undefined;
    return [
      <span key={trigger} className="inline-flex items-center gap-1">
        <Tag>{RUN_TRIGGER_LABELS[trigger]}</Tag>
        {branches?.map((branch) => (
          <Tag key={branch}>
            <GitBranch />
            {branch}
          </Tag>
        ))}
      </span>,
    ];
  });
}

/** The job's schedules, or what else starts it when it has none. */
export function JobSchedule({ job }: { job: Job }) {
  if (job.state === "invalid") {
    return <Tag tone="danger">Invalid</Tag>;
  }
  if (job.on.schedule !== undefined) {
    return job.on.schedule.map(({ cron }) => (
      <Tooltip key={cron} label={describeSchedule(cron)}>
        <Tag tabIndex={0}>{shortSchedule(cron)}</Tag>
      </Tooltip>
    ));
  }
  return <JobTriggers on={job.on} />;
}

export function RunNowButton({
  params,
  job,
  label,
}: {
  params: Params;
  job: Job;
  label?: boolean;
}) {
  const { client } = useRouteContext({ from: "/$orgId" });
  const { orgId, agent } = params;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const dispatch = useMutation({
    mutationFn: () => client.jobs.dispatch({ agent, job: job.name }),
    onSuccess: async (run) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: automationsQuery(params).queryKey }),
        queryClient.invalidateQueries({ queryKey: runsKey(params) }),
      ]);
      await navigate({
        to: "/$orgId/agents/$agent/runs/$run",
        params: { orgId, agent, run: run.id },
      });
    },
  });
  if (
    job.state === "invalid" ||
    job.on.workflow_dispatch === undefined ||
    Object.values(job.inputs).some((input) => input.required && input.default === undefined)
  ) {
    return null;
  }

  const error = dispatch.error?.message;
  return label ? (
    <div className="flex items-center gap-3">
      {error !== undefined && (
        <p role="alert" className="type-label-13 text-danger">
          {error}
        </p>
      )}
      <Button disabled={dispatch.isPending} onClick={() => dispatch.mutate()}>
        <Play className="size-4" />
        Run now
      </Button>
    </div>
  ) : (
    <IconButton
      label={error ?? "Run now"}
      size="small"
      disabled={dispatch.isPending}
      onClick={() => dispatch.mutate()}
      className={error === undefined ? undefined : "text-danger"}
    >
      <Play className="size-4" />
    </IconButton>
  );
}

export function RunDuration({ run }: { run: JobRun }) {
  if (run.started_at === null || run.completed_at === null) {
    return null;
  }

  return formatDuration(
    (Date.parse(run.completed_at) - Date.parse(run.started_at)) * NANOS_PER_MILLI,
  );
}

/** The step a live run is on, with its place among the steps in the tooltip. */
export function RunProgress({ run }: { run: JobRun }) {
  const index = run.steps.findIndex(({ status }) => status !== "completed");
  const step = run.steps[index];
  if (run.status === "queued" || step === undefined) {
    return null;
  }

  return (
    <Tooltip label={`Step ${index + 1} of ${run.steps.length}`}>
      <span tabIndex={0} className="truncate text-muted">
        {step.name}
      </span>
    </Tooltip>
  );
}

export function RunTable({
  params,
  runs,
  jobs,
  live,
  empty,
}: {
  params: Params;
  runs: JobRun[];
  jobs?: readonly { job: Job }[];
  live?: boolean;
  empty: { title: string; description: string };
}) {
  const title = (run: JobRun) => {
    const row = jobs?.find((each) => each.job.name === run.job);
    return row === undefined ? run.job : jobTitle(row.job);
  };

  return (
    <div className="card overflow-clip">
      <table aria-label="Runs" className="record-table">
        <thead>
          <tr>
            <th className="w-full">{jobs ? "Automation" : "Run"}</th>
            <th className="@max-lg:hidden">Trigger</th>
            <th className="@max-2xl:hidden">Ref</th>
            <th>{live ? "Progress" : "Result"}</th>
            <th>Started</th>
            {!live && <th className="@max-lg:hidden">Duration</th>}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td className="max-w-0 text-ink">
                <Link
                  to="/$orgId/agents/$agent/runs/$run"
                  params={{ ...params, run: run.id }}
                  className="row-action block truncate"
                >
                  {jobs ? title(run) : run.id.slice(0, 8)}
                </Link>
              </td>
              <td className="text-muted @max-lg:hidden">{RUN_TRIGGER_LABELS[run.trigger]}</td>
              <td className="@max-2xl:hidden">
                <Tooltip label={run.sha}>
                  <Tag tabIndex={0}>{run.ref.replace(/^refs\/heads\//, "")}</Tag>
                </Tooltip>
              </td>
              <td className={live ? "max-w-96 @max-2xl:max-w-40" : undefined}>
                {live ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <RunStatusTag run={run} />
                    <RunProgress run={run} />
                  </span>
                ) : (
                  <RunStatusTag run={run} />
                )}
              </td>
              <td className="whitespace-nowrap">
                <TimeTag at={run.created_at} short />
              </td>
              {!live && (
                <td className="whitespace-nowrap tabular-nums @max-lg:hidden">
                  <Tag><RunDuration run={run} /></Tag>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {runs.length === 0 && <EmptyState {...empty} />}
    </div>
  );
}

/** Previous and next buttons over pages of `RUNS_PAGE_SIZE` runs. */
export function RunPages({ page, count }: { page: number; count: number }) {
  if (page === 1 && count < RUNS_PAGE_SIZE) {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-2 type-meta-12 text-muted tabular-nums">
      {`Page ${page}`}
      <PageLink
        label="Previous page"
        search={page === 1 ? undefined : { page: page === 2 ? undefined : page - 1 }}
      >
        <ChevronLeft className="size-4" />
      </PageLink>
      <PageLink label="Next page" search={count < RUNS_PAGE_SIZE ? undefined : { page: page + 1 }}>
        <ChevronRight className="size-4" />
      </PageLink>
    </div>
  );
}
