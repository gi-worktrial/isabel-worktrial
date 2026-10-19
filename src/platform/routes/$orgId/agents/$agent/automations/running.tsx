import { useSuspenseQuery } from "@tanstack/react-query";
import { automationsQuery, runningQuery } from "#/queries";
import { createFileRoute } from "@tanstack/react-router";

import { RunTable } from "../../../../../automations";

export const Route = createFileRoute("/$orgId/agents/$agent/automations/running")({
  loader: ({ context: { queryClient }, params }) =>
    Promise.all([
      queryClient.ensureQueryData(runningQuery(params)),
      queryClient.ensureQueryData(automationsQuery(params)),
    ]),
  component: RunningAutomations,
});

function RunningAutomations() {
  const params = Route.useParams();
  const jobs = useSuspenseQuery(automationsQuery(params)).data;
  const runs = useSuspenseQuery(runningQuery(params)).data;

  return (
    <RunTable
      params={params}
      runs={runs}
      jobs={jobs}
      live
      empty={{
        title: "Nothing running",
        description: "Runs show here while they're queued or in progress.",
      }}
    />
  );
}
