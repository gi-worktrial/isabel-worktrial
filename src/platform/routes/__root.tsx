// shim: platform's root renders the html document for its server; ours is the SPA's root, whose index.html sets the
// theme before the first paint, and an unknown path opens the first Agent's Inbox
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Navigate } from "@tanstack/react-router";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  notFoundComponent: () => <Navigate to="/" replace />,
});
