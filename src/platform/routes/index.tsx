import { createFileRoute, redirect } from "@tanstack/react-router";

import { getLastOrganizationId, getOrganizations } from "../db/organizations";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [organizations, lastOrganizationId] = await Promise.all([
      getOrganizations(),
      getLastOrganizationId(),
    ]);

    const organization =
      organizations.find(({ id }) => id === lastOrganizationId) ?? organizations[0];
    if (!organization) {
      throw new Error("Expected an organization membership");
    }

    throw redirect({ to: "/$orgId", params: { orgId: organization.id } });
  },
});
