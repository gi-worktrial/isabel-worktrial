import { Outlet, createFileRoute } from "@tanstack/react-router";

import { Tab, Tabs } from "#/ui/tabs";
import { crumbs } from "#/crumbs";

export const Route = createFileRoute("/$orgId/agents/$agent/automations")({
  loader: () => crumbs({ label: "Automations", to: "/$orgId/agents/$agent/automations" }),
  component: Automations,
});

function Automations() {
  const params = Route.useParams();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="type-title-18 text-ink">Automations</h1>
      <Tabs label="Automations sections">
        <Tab to="/$orgId/agents/$agent/automations" params={params} activeOptions={{ exact: true }}>
          Overview
        </Tab>
        <Tab to="/$orgId/agents/$agent/automations/running" params={params}>
          Running
        </Tab>
        <Tab to="/$orgId/agents/$agent/automations/runs" params={params}>
          All runs
        </Tab>
      </Tabs>
      <Outlet />
    </div>
  );
}
