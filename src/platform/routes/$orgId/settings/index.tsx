import { Link, createFileRoute } from "@tanstack/react-router";

import { buttonVariants } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Field, FieldGroup } from "#/ui/field";
import { SegmentedControl } from "#/ui/segmented-control";
import { setTheme, useTheme, type Theme } from "#/ui/theme";
import { crumbs } from "#/crumbs";
import { SettingsPage } from "#src/features/settings/settings-page";

const themes: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const LINK = cn(buttonVariants(), "self-start");

export const Route = createFileRoute("/$orgId/settings/")({
  loader: () => crumbs({ label: "Settings", to: "/$orgId/settings" }),
  component: Settings,
});

function Settings() {
  const { orgId } = Route.useParams();
  const { access } = Route.useRouteContext();
  const theme = useTheme();

  return (
    <SettingsPage title="Settings">
      <FieldGroup title="Organization">
        <Field label="Members">
          <Link
            to="/$orgId/settings/members"
            params={{ orgId }}
            className={LINK}
          >
            {access.admin ? "Manage members and invitations" : "View members"}
          </Link>
        </Field>
        {access.admin && (
          <Field label="Models">
            <Link
              to="/$orgId/settings/models"
              params={{ orgId }}
              className={LINK}
            >
              Manage this organization's models and usage
            </Link>
          </Field>
        )}
        {access.admin && (
          <Field label="Sandboxes">
            <Link
              to="/$orgId/settings/sandboxes"
              params={{ orgId }}
              className={LINK}
            >
              View running sandboxes against this organization's limit
            </Link>
          </Field>
        )}
        {access.admin && (
          <Field label="GitHub">
            <Link
              to="/$orgId/settings/github"
              params={{ orgId }}
              className={LINK}
            >
              Connect GitHub repositories
            </Link>
          </Field>
        )}
        {access.operator && (
          <Field label="Deployment">
            <Link
              to="/$orgId/settings/deployment"
              params={{ orgId }}
              className={LINK}
            >
              Manage shared models and usage across organizations
            </Link>
          </Field>
        )}
      </FieldGroup>
      <FieldGroup title="Appearance">
        <Field label="Theme">
          <SegmentedControl
            label="Theme"
            value={theme}
            segments={themes}
            onChange={setTheme}
            className="self-start"
          />
        </Field>
      </FieldGroup>
    </SettingsPage>
  );
}
