import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { modelsQuery, usageQuery } from "#/queries";
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
import { EmptyLine, Locked, SettingsPage } from "#src/features/settings/settings-page";
import { SETTINGS_LOCKS } from "#src/queries/client";

export const Route = createFileRoute("/$orgId/settings/models")({
  validateSearch: usageRangeSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, params, deps }) => {
    await Promise.all([
      queryClient.ensureQueryData(modelsQuery(params)),
      queryClient.ensureQueryData(usageQuery({ ...params, start: deps.start, end: deps.end })),
    ]);
    return crumbs(
      { label: "Settings", to: "/$orgId/settings" },
      { label: "Models", to: "/$orgId/settings/models" },
    );
  },
  component: Models,
});

function Models() {
  const { orgId } = Route.useParams();
  const { client } = Route.useRouteContext();
  const { start, end } = Route.useSearch();
  const models = useSuspenseQuery(modelsQuery({ orgId })).data;
  const usage = useSuspenseQuery(usageQuery({ orgId, start, end })).data;
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const own = models.filter((model) => model.owner === orgId);
  const shared = models.filter((model) => model.owner !== orgId);

  async function act(change: Promise<unknown>) {
    await change;
    await queryClient.invalidateQueries();
  }

  return (
    <SettingsPage title="Models">
      <FieldGroup title="This organization's models">
        <p className="text-muted">Only this organization can call these, by the name shown.</p>
        <ul className="flex flex-col gap-2 empty:hidden">
          {own.map((model) => (
            <li key={model.id}>
              {model.name} ({model.model}){" "}
              <Button size="small" onClick={() => act(client.settings.deleteModel(model.id))}>
                Delete
              </Button>
              <ModelReasoning model={model} />
            </li>
          ))}
        </ul>
        {own.length === 0 && <EmptyLine>No models added yet</EmptyLine>}
        <Locked reason={SETTINGS_LOCKS.models}>
        <ModelForm create={(model) => act(client.settings.createModel(model))} />
        </Locked>
      </FieldGroup>

      <FieldGroup title="Shared models">
        <ul className="flex flex-col gap-2 empty:hidden">
          {shared.map((model) => (
            <li key={model.id}>
              {model.name} ({model.model})
              <ModelReasoning model={model} />
            </li>
          ))}
        </ul>
        {shared.length === 0 && <EmptyLine>No shared models yet</EmptyLine>}
      </FieldGroup>

      <FieldGroup title="Usage">
        <UsageRangeInputs
          range={usage}
          onChange={(change) =>
            void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true })
          }
        />
        {usage.models.length === 0 ? (
          <EmptyState title="No usage in this range" />
        ) : (
        <UsageTable rows={usage.models.map((row) => ({ ...row, label: row.model }))} />
        )}
      </FieldGroup>
    </SettingsPage>
  );
}
