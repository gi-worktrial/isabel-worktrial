import type { Walkthroughs } from "#src/demo/walkthrough/state";
import type { ProductClient } from "#src/queries/client";

export const DEMO_ORG = "demo";
export type Written = { key: string; raw: string | null; stale: boolean };

// another tab's save rebuilds the client while unchanged saves keep its caches warm
export const openedDemos = new Map<string, { layer: Written; client: ProductClient }>();
export const walkthroughsOf = new Map<string, Walkthroughs>();
