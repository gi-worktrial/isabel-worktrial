import { useSuspenseQuery } from "@tanstack/react-query";
import { issueEventsQuery } from "#/queries";
import { createFileRoute } from "@tanstack/react-router";

import { ActivityLog } from "#src/features/issue/activity-log";

export const Route = createFileRoute("/$orgId/agents/$agent/issues/$issue/activity")({
  loader: ({ context: { queryClient }, params }) =>
    queryClient.ensureQueryData(issueEventsQuery(params)),
  component: IssueActivity,
});

function IssueActivity() {
  const params = Route.useParams();
  const { events, names } = useSuspenseQuery(issueEventsQuery(params)).data;
  return <ActivityLog events={events} names={names} params={params} />;
}
