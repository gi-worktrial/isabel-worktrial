import { shellQuery } from "#/queries";
import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import { getActiveAgent } from "#/last-visited-agent";
import { crumbs } from "#/crumbs";

const shell = getRouteApi("/$orgId");

export const Route = createFileRoute("/$orgId/")({
  beforeLoad: ({ context, params }) => {
    if (!context.access.tenant) {
      throw redirect({ to: "/$orgId/settings", params });
    }
  },
  loader: async ({ context: { access, queryClient }, params: { orgId } }) => {
    const { agents } = await queryClient.query(shellQuery({ orgId, tenant: access.tenant }));
    const agent = getActiveAgent(orgId, agents);
    if (agent !== undefined) {
      throw redirect({ to: "/$orgId/agents/$agent", params: { orgId, agent } });
    }
    return crumbs({ label: "Home", to: "/$orgId" });
  },
  component: Home,
});

function Home() {
  const { email } = shell.useRouteContext().access;

  return (
    <main>
      <h1 className="type-title-18">Grounded Platform</h1>
      <p>Signed in as {email}</p>
      <a href="/api/auth/sign-out">Sign out</a>
    </main>
  );
}
