import { useSyncExternalStore } from "react";
import { z } from "zod";

import { localPersistence, SavedStore } from "#src/data/storage";
import { PANES_KEY } from "#src/data/storage-keys";

/** The side of the page Pebble's panel docks on. */
export type PaneSide = "left" | "right";

const PanesSchema = z.strictObject({ side: z.enum(["left", "right"]) });
type Panes = z.infer<typeof PanesSchema>;

class PanesStore extends SavedStore<Panes> {
  getSnapshot = (): Panes => this.saved;

  dock(side: PaneSide): void {
    if (side !== this.saved.side) {
      this.commit({ side });
    }
  }
}

export const panes = new PanesStore(localPersistence(PANES_KEY), (raw) => PanesSchema.parse(raw), {
  side: "right",
});

export const otherSide = (side: PaneSide): PaneSide => (side === "left" ? "right" : "left");

export function usePebbleSide(): PaneSide {
  return useSyncExternalStore(panes.subscribe, panes.getSnapshot).side;
}
