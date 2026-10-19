import { useSuspenseQuery } from "@tanstack/react-query";
import { automationsQuery, runsQuery } from "#/queries";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RunPages, RunTable } from "../../../../../automations";

export const Route = createFileRoute("/$orgId/agents/$agent/automations/runs")({
  validateSearch: z.object({ page: z.number().int().min(1).optional() }),
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, params, deps }) =>
    Promise.all([
      queryClient.ensureQueryData(runsQuery({ ...params, page: deps.page ?? 1 })),
      queryClient.ensureQueryData(automationsQuery(params)),
    ]),
  component: AllRuns,
});

function AllRuns() {
  const params = Route.useParams();
  const jobs = useSuspenseQuery(automationsQuery(params)).data;
  const { page = 1 } = Route.useSearch();
  const runs = useSuspenseQuery(runsQuery({ ...params, page })).data;

  return (
    <div className="flex flex-col gap-3">
      <RunTable
        params={params}
        runs={runs}
        jobs={jobs}
        empty={{ title: "No runs yet", description: "Runs show here once an Automation starts." }}
      />
      <RunPages page={page} count={runs.length} />
    </div>
  );
}
