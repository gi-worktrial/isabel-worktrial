import type { ProductClient } from "#src/queries/client";

import { emptyObjects, type Objects } from "./git.ts";
import type { Submitted } from "./runs.ts";
import type { PullRecord, Seed } from "./seed/types.ts";
import type { ThreadRecord } from "./threads.ts";

/** What the viewer did, kept under one storage key that Reset clears. */
export type Layer = {
  objects: Objects;
  runs: Submitted[];
  pulls: PullRecord[];
  threads: ThreadRecord[];
};

export const emptyLayer = (): Layer => ({
  objects: emptyObjects(),
  runs: [],
  pulls: [],
  threads: [],
});

// seeds are rebuilt between demos, so a saved layer fits only when every ref and parent it names exists
export function layerFits(seed: Seed, layer: Layer): boolean {
  const known = (sha: string) =>
    layer.objects.commits[sha] !== undefined || seed.repo.commits[sha] !== undefined;
  return (
    Object.values(layer.objects.refs).every((sha) => sha === null || known(sha)) &&
    Object.values(layer.objects.commits).every((commit) => commit.parents.every(known))
  );
}

interface ViewerLayer {
  reset(agentId?: string): void;
  snapshot(): () => void;
}

const layers = new WeakMap<ProductClient, ViewerLayer>();

export function registerReset(client: ProductClient, layer: ViewerLayer): void {
  layers.set(client, layer);
}

export function viewerLayer(client: ProductClient): ViewerLayer | undefined {
  return layers.get(client);
}
