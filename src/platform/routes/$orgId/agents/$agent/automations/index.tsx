import { useSuspenseQuery } from "@tanstack/react-query";
import { automationsQuery } from "#/queries";
import { Link, createFileRoute } from "@tanstack/react-router";

import { RunNowButton, JobSchedule, jobTitle } from "../../../../../automations";
import { RunStatusTag } from "#/run-status";
import { EmptyState } from "#/ui/empty-state";
import { TimeTag } from "#src/ui/time-tag";

export const Route = createFileRoute("/$orgId/agents/$agent/automations/")({
  loader: ({ context: { queryClient }, params }) =>
    queryClient.ensureQueryData(automationsQuery(params)),
  component: AutomationsOverview,
});

function AutomationsOverview() {
  const { orgId, agent } = Route.useParams();
  const rows = useSuspenseQuery(automationsQuery({ orgId, agent })).data;

  return (
    <div className="card overflow-clip">
      <table aria-label="Automations" className="record-table">
        <thead>
          <tr>
            <th className="w-full">Name</th>
            <th className="@max-lg:hidden">Schedule</th>
            <th>Last result</th>
            <th>Last run</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ job, latest }) => (
            <tr key={job.name}>
              <td className="max-w-0 text-ink">
                <Link
                  to="/$orgId/agents/$agent/jobs/$job"
                  params={{ orgId, agent, job: job.name }}
                  className="row-action flex min-w-0 items-baseline gap-2"
                >
                  <span className="truncate">{jobTitle(job)}</span>
                </Link>
              </td>
              <td className="@max-lg:hidden">
                <span className="flex items-center gap-1">
                  <JobSchedule job={job} />
                </span>
              </td>
              <td>
                {latest === undefined ? (
                  <span className="text-muted">Never run</span>
                ) : (
                  <Link
                    to="/$orgId/agents/$agent/runs/$run"
                    params={{ orgId, agent, run: latest.id }}
                    className="relative z-10 rounded-xs"
                  >
                    <RunStatusTag run={latest} />
                  </Link>
                )}
              </td>
              <td className="whitespace-nowrap">
                {latest !== undefined && <TimeTag at={latest.created_at} short />}
              </td>
              <td className="relative z-10">
                <RunNowButton params={{ orgId, agent }} job={job} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <EmptyState
          title="No Automations yet"
          description="Automations show here once they're committed under .grounded/jobs/ in the Agent's repo."
        />
      )}
    </div>
  );
}
