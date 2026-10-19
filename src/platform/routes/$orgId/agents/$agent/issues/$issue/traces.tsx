import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { IssueTraceTable } from "#/issue-traces";
import { SESSION_PAGE_SIZE, issueTracesQuery } from "#/queries";

export const Route = createFileRoute("/$orgId/agents/$agent/issues/$issue/traces")({
  validateSearch: z.object({ afters: z.array(z.string()).optional() }),
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, params, deps }) =>
    queryClient.ensureQueryData(
      issueTracesQuery({ ...params, after: deps.afters?.at(-1), limit: SESSION_PAGE_SIZE }),
    ),
  component: IssueTraces,
});

function IssueTraces() {
  const { afters = [] } = Route.useSearch();

  return <IssueTraceTable afters={afters} />;
}
