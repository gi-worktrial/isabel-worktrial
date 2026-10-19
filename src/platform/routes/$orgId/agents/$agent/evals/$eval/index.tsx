import { useSuspenseQuery } from "@tanstack/react-query";
import { evalQuery } from "#/queries";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { CriteriaList } from "../../../../../../evals";
import { Markdown } from "#/ui/markdown";

const evalRoute = getRouteApi("/$orgId/agents/$agent/evals/$eval");

export const Route = createFileRoute("/$orgId/agents/$agent/evals/$eval/")({
  component: EvalDefinition,
});

function EvalDefinition() {
  const { orgId, agent, eval: id } = evalRoute.useParams();
  const task = useSuspenseQuery(evalQuery({ orgId, agent, eval: id })).data;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="User prompt" className="flex flex-col gap-3">
        <h2 className="type-heading-15 text-ink">User prompt</h2>
        <div className="card px-4 py-3">
          <div className="max-w-reading">
            <Markdown text={task.prompt} />
          </div>
        </div>
      </section>
      <section aria-label="Criteria" className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 type-heading-15 text-ink">
          Criteria
          <span className="text-muted tabular-nums">{task.criteria.length}</span>
        </h2>
        <div className="card px-4">
          <CriteriaList criteria={task.criteria} />
        </div>
      </section>
    </div>
  );
}
