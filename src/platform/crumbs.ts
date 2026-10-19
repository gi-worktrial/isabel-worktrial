import type { FileRouteTypes } from "./routeTree.gen";

/** A breadcrumb a route's loader returns, linking to `to` with the current page's params. */
export type Crumb = { label: string; to: FileRouteTypes["to"]; params?: Record<string, string> };

export const crumbs = (...trail: Crumb[]) => ({ crumbs: trail });
