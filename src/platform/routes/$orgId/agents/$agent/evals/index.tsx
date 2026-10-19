import { useSuspenseQuery } from "@tanstack/react-query";
import { evalStatusesQuery, evalsQuery } from "#/queries";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { EvalTable } from "../../../../../evals";
import { EmptyState } from "#/ui/empty-state";
import { SearchField } from "#/ui/search-field";
import { Tag } from "#/ui/tag";
import { crumbs } from "#/crumbs";

export const Route = createFileRoute("/$orgId/agents/$agent/evals/")({
  loader: async ({ context: { queryClient }, params }) => {
    await Promise.all([
      queryClient.ensureQueryData(evalsQuery(params)),
      queryClient.ensureQueryData(evalStatusesQuery(params)),
    ]);
    return crumbs({ label: "Grounded Evals", to: "/$orgId/agents/$agent/evals" });
  },
  component: GroundedEvals,
});

function GroundedEvals() {
  const { orgId, agent } = Route.useParams();
  const evals = useSuspenseQuery(evalsQuery({ orgId, agent })).data;
  const { run, evals: statusList } = useSuspenseQuery(evalStatusesQuery({ orgId, agent })).data;
  const statuses = new Map(statusList.map((status) => [status.eval, status]));
  const [query, setQuery] = useState("");
  const rows = evals
    .filter((task) =>
      [task.title, task.id, ...task.issues].join(" ").toLowerCase().includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(statuses.get(a.id)?.passed !== false) - Number(statuses.get(b.id)?.passed !== false),
    );

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="type-title-18 text-ink">Grounded Evals</h1>
        <div role="group" aria-label="Filters" className="flex flex-1 flex-wrap items-center gap-2">
          {run !== undefined && run.completed_at === null && (
            <Link to="/$orgId/agents/$agent/runs/$run" params={{ orgId, agent, run: run.id }}>
              <Tag>Running</Tag>
            </Link>
          )}
          <SearchField
            label="Search Evals"
            placeholder="Search Evals"
            value={query}
            onChange={setQuery}
            className="ml-auto w-64"
          />
        </div>
      </header>
      <div className="card overflow-clip">
        {evals.length === 0 ? (
          <EmptyState
            title="No Evals yet"
            description="Evals show here once they're committed under evals/tasks/ in the Agent's repo."
          />
        ) : rows.length === 0 ? (
          <EmptyState title="No Evals match" onClear={() => setQuery("")} />
        ) : (
          <EvalTable orgId={orgId} agent={agent} evals={rows} statuses={statuses} />
        )}
      </div>
    </div>
  );
}
