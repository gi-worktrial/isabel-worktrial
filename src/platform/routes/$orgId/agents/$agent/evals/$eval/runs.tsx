import { useSuspenseQuery } from "@tanstack/react-query";
import { SESSION_PAGE_SIZE, sessionsQuery } from "#/queries";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SessionTable } from "../../../../../../session-table";
import { EmptyState } from "#/ui/empty-state";
import { EvalRunTrials } from "#src/features/traces/run-pages";
import { TRIALS_SEARCH } from "#src/features/traces/search";

const runsQuery = (orgId: string, agent: string, id: string, afters: string[] | undefined) =>
  sessionsQuery({
    orgId,
    agent,
    trial: true,
    attribute: [`grounded.task.name:${id}`],
    after: afters?.at(-1),
    limit: SESSION_PAGE_SIZE,
  });

export const Route = createFileRoute("/$orgId/agents/$agent/evals/$eval/runs")({
  validateSearch: z.object({ afters: z.array(z.string()).optional(), ...TRIALS_SEARCH }),
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, params, deps }) =>
    queryClient.ensureQueryData(runsQuery(params.orgId, params.agent, params.eval, deps.afters)),
  component: EvalRuns,
});

function EvalRuns() {
  const { orgId, agent, eval: id } = Route.useParams();
  const { afters = [] } = Route.useSearch();
  const page = useSuspenseQuery(runsQuery(orgId, agent, id, afters)).data;

  return (
    <div className="flex flex-col gap-4">
      <EvalRunTrials params={{ orgId, agent, eval: id }} sessions={page.sessions} />
      <SessionTable
        orgId={orgId}
        agent={agent}
        page={page}
        source="eval"
        afters={afters}
        empty={
          <EmptyState
            title="No runs yet"
            description="Trials show here once grounded/run-evals runs this Eval."
          />
        }
      />
    </div>
  );
}
