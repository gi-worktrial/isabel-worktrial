import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { deploymentQuery } from "#/queries";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ModelForm,
  ModelReasoning,
  UsageRangeInputs,
  UsageTable,
  usageRangeSchema,
} from "../../../models";
import { Button } from "#/ui/button";
import { FieldGroup } from "#/ui/field";
import { crumbs } from "#/crumbs";
import { EmptyState } from "#/ui/empty-state";
import { SettingsPage } from "#src/features/settings/settings-page";

export const Route = createFileRoute("/$orgId/settings/deployment")({
  validateSearch: usageRangeSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient, access }, params, deps }) => {
    // a link to it reaches a viewer who isn't an operator, who sees the refusal rather than a failed read
    if (access.operator) {
      await queryClient.ensureQueryData(
        deploymentQuery({ ...params, start: deps.start, end: deps.end }),
      );
    }
    return crumbs(
      { label: "Settings", to: "/$orgId/settings" },
      { label: "Deployment", to: "/$orgId/settings/deployment" },
    );
  },
  component: DeploymentPage,
});

function DeploymentPage() {
  const { access } = Route.useRouteContext();
  return access.operator ? (
    <Deployment />
  ) : (
    <SettingsPage title="Deployment">
      <EmptyState
        title="Only operators see Deployment"
        description="The data plane's operators manage its shared models and usage here."
      />
    </SettingsPage>
  );
}

function Deployment() {
  const { client } = Route.useRouteContext();
  const { orgId } = Route.useParams();
  const { start, end } = Route.useSearch();
  const { models, usage, names } = useSuspenseQuery(deploymentQuery({ orgId, start, end })).data;
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const nameOf = (org: string | null) => (org ? (names[org] ?? org) : "no organization");

  async function act(change: Promise<unknown>) {
    await change;
    await queryClient.invalidateQueries();
  }

  return (
    <div className="flex flex-col gap-10">
      <FieldGroup title="Shared models">
        <p className="text-muted">Every organization on this data plane can call these.</p>
        <ul className="flex flex-col gap-2">
          {models
            .filter((model) => model.owner === "shared")
            .map((model) => (
              <li key={model.id}>
                {model.name} ({model.model}){" "}
                {model.editable && (
                  <Button size="small" onClick={() => act(client.deployment.deleteModel(model.id))}>
                    Delete
                  </Button>
                )}
                <ModelReasoning model={model} />
              </li>
            ))}
        </ul>
        <ModelForm create={(model) => act(client.deployment.createModel(model))} />
      </FieldGroup>

      <FieldGroup title="Models organizations added for themselves">
        <p className="text-muted">Only the organization that added each one can call it.</p>
        <ul className="flex flex-col gap-2">
          {models
            .filter((model) => model.owner !== "shared")
            .map((model) => (
              <li key={model.id}>
                {model.name} ({model.model}), {nameOf(model.owner)}
                <ModelReasoning model={model} />
              </li>
            ))}
        </ul>
      </FieldGroup>

      <FieldGroup title="Usage by organization">
        <UsageRangeInputs
          range={usage}
          onChange={(change) =>
            void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true })
          }
        />
        <UsageTable rows={usage.organizations.map((row) => ({ ...row, label: nameOf(row.org) }))} />
      </FieldGroup>
      <FieldGroup title="Usage by model">
        <UsageTable rows={usage.models.map((row) => ({ ...row, label: row.model }))} />
      </FieldGroup>
    </div>
  );
}
