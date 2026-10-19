import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgId/agents/$agent/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$orgId/agents/$agent/issues", params });
  },
});
