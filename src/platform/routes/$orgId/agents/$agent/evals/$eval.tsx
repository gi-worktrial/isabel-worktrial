import { useSuspenseQuery } from "@tanstack/react-query";
import { evalQuery } from "#/queries";
import { Outlet, createFileRoute } from "@tanstack/react-router";

import { IssueLinks } from "../../../../../evals";
import { Fact, Facts } from "#/ui/facts";
import { Tab, Tabs } from "#/ui/tabs";
import { crumbs } from "#/crumbs";

export const Route = createFileRoute("/$orgId/agents/$agent/evals/$eval")({
  loader: async ({ context: { queryClient }, params }) => {
    const task = await queryClient.ensureQueryData(evalQuery(params));
    return crumbs(
      { label: "Grounded Evals", to: "/$orgId/agents/$agent/evals" },
      { label: task.title, to: "/$orgId/agents/$agent/evals/$eval" },
    );
  },
  component: EvalPage,
});

function EvalPage() {
  const { orgId, agent, eval: id } = Route.useParams();
  const task = useSuspenseQuery(evalQuery({ orgId, agent, eval: id })).data;
  const params = { orgId, agent, eval: task.id };

  return (
    <article aria-label="Eval" className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="truncate type-title-18 text-ink" title={task.title}>
          {task.title}
        </h1>
        <Facts label="Eval details">
          {task.issues.length > 0 && (
            <Fact label="Reproduces">
              <IssueLinks orgId={orgId} agent={agent} issues={task.issues} />
            </Fact>
          )}
          <Fact label="Files">
            <span className="type-mono-12">{task.path}</span>
          </Fact>
        </Facts>
      </header>
      <Tabs label="Eval sections">
        <Tab to="/$orgId/agents/$agent/evals/$eval" params={params} activeOptions={{ exact: true }}>
          Definition
        </Tab>
        <Tab to="/$orgId/agents/$agent/evals/$eval/runs" params={params}>
          Runs
        </Tab>
      </Tabs>
      <Outlet />
    </article>
  );
}
