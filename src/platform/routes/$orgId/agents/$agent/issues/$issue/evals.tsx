import { useSuspenseQuery } from "@tanstack/react-query";
import { issueEvalsQuery } from "#/queries";
import { createFileRoute } from "@tanstack/react-router";

import { EvalTable } from "../../../../../../evals";
import { EmptyState } from "#/ui/empty-state";
import { AddEvals, DebugEvalsAction } from "#src/features/debug/new-eval";

export const Route = createFileRoute("/$orgId/agents/$agent/issues/$issue/evals")({
  loader: ({ context: { queryClient }, params }) =>
    queryClient.ensureQueryData(issueEvalsQuery(params)),
  component: IssueEvals,
});

function IssueEvals() {
  const { orgId, agent, issue } = Route.useParams();
  const evals = useSuspenseQuery(issueEvalsQuery(Route.useParams())).data;

  return (
    <div className="flex flex-col gap-3">
      <DebugEvalsAction exists={evals !== null} />
      <div className="card overflow-clip">
        {evals === null || evals.length === 0 ? (
          <EmptyState
            title="No Evals reproduce this Issue"
            description="Evals show here once the Issue's evals branch lists this Issue for them."
            action={<AddEvals />}
          />
        ) : (
          <EvalTable orgId={orgId} agent={agent} evals={evals} issue={issue} />
        )}
      </div>
    </div>
  );
}
