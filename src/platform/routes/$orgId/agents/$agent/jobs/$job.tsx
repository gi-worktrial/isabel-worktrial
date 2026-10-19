import { useSuspenseQuery } from "@tanstack/react-query";
import { jobQuery, runsQuery } from "#/queries";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  RunNowButton,
  RunPages,
  RunTable,
  JobSchedule,
  JobTriggers,
} from "../../../../../automations";
import { jobTitle } from "#/titles";
import { Fact, Facts } from "#/ui/facts";
import { crumbs } from "#/crumbs";

export const Route = createFileRoute("/$orgId/agents/$agent/jobs/$job")({
  validateSearch: z.object({ page: z.number().int().min(1).optional() }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, params, deps }) => {
    const [job] = await Promise.all([
      queryClient.ensureQueryData(jobQuery(params)),
      queryClient.ensureQueryData(runsQuery({ ...params, page: deps.page ?? 1 })),
    ]);
    return crumbs(
      { label: "Automations", to: "/$orgId/agents/$agent/automations" },
      { label: jobTitle(job), to: "/$orgId/agents/$agent/jobs/$job" },
    );
  },
  component: AutomationPage,
});

function AutomationPage() {
  const { orgId, agent, job: name } = Route.useParams();
  const { page = 1 } = Route.useSearch();
  const job = useSuspenseQuery(jobQuery({ orgId, agent, job: name })).data;
  const runs = useSuspenseQuery(runsQuery({ orgId, agent, job: name, page })).data;

  return (
    <article aria-label="Automation" className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="flex min-w-0 flex-1 basis-64 items-center gap-3 type-title-18 text-ink">
            <span className="min-w-0 truncate">{jobTitle(job)}</span>
          </h1>
          <RunNowButton params={{ orgId, agent }} job={job} label />
        </div>
        {job.state === "invalid" ? (
          <p role="alert" className="type-label-13 whitespace-pre-wrap text-danger">
            {job.error}
          </p>
        ) : (
          <Facts label="Automation details">
            <Fact label="Schedule">
              {job.on.schedule === undefined ? "None" : <JobSchedule job={job} />}
            </Fact>
            <Fact label="Runs on">
              <JobTriggers on={job.on} />
            </Fact>
            <Fact label="Steps">{job.steps.length}</Fact>
          </Facts>
        )}
      </header>
      <section aria-label="Runs" className="flex flex-col gap-3">
        <h2 className="type-heading-15 text-ink">Runs</h2>
        <RunTable
          params={{ orgId, agent }}
          runs={runs}
          empty={{
            title: "No runs yet",
            description: "Runs show here once this Automation starts.",
          }}
        />
        <RunPages page={page} count={runs.length} />
      </section>
    </article>
  );
}
