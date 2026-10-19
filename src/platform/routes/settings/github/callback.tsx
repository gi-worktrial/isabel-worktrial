import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { INSTALL_STATE_KEY, installStateSchema } from "../../../github";
import { servicesClient } from "../../../services";

// GitHub's App redirect URI is one URL for every organization, so the organization comes from the `state` the install link carried.
export const Route = createFileRoute("/settings/github/callback")({
  ssr: false,
  validateSearch: z.object({
    code: z.string(),
    installation_id: z.coerce.number(),
    state: z.string(),
  }),
  beforeLoad: async ({ search: { code, installation_id, state } }) => {
    const stored = installStateSchema.safeParse(
      JSON.parse(sessionStorage.getItem(INSTALL_STATE_KEY) ?? "null"),
    );
    sessionStorage.removeItem(INSTALL_STATE_KEY);
    if (!stored.success || stored.data.state !== state) {
      throw new Error("This GitHub install didn't start here. Connect GitHub from Settings again.");
    }

    const { orgId } = stored.data;
    await servicesClient(orgId).installations.create({ installation_id, code });
    throw redirect({ to: "/$orgId/settings/github", params: { orgId } });
  },
});
