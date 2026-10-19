import type { FileRouteTypes } from "./routeTree.gen";

export type CrumbNeighbor = {
  label: string;
  to: FileRouteTypes["to"];
  params?: Record<string, string>;
};

/** A breadcrumb a route's loader returns, linking to `to` with the current page's params. */
export type Crumb = {
  label: string;
  to: FileRouteTypes["to"];
  params?: Record<string, string>;
  neighbors?: { up?: CrumbNeighbor; down?: CrumbNeighbor };
};

export const crumbs = (...trail: Crumb[]) => ({ crumbs: trail });
