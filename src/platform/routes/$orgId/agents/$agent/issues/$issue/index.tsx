import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgId/agents/$agent/issues/$issue/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$orgId/agents/$agent/issues/$issue/candidates",
      params,
      replace: true,
    });
  },
});
