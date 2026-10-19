import { createContext, use, useSyncExternalStore } from "react";
import { z } from "zod";

import { listeners, localPersistence, SavedStore } from "#src/app/public";
import {
  GET_STARTED_KEY,
  WALKTHROUGH_IDS,
  WalkthroughGroupSchema,
  type WalkthroughId,
  walkthroughsSchema,
} from "#src/demo/plane/seed/walkthroughs";
import { PebbleAnswerSchema } from "#src/pebble/wire";

// recorded answers are checked against Pebble's own answers
export const WalkthroughsSchema = walkthroughsSchema(PebbleAnswerSchema);
export type Walkthroughs = z.infer<typeof WalkthroughsSchema>;
export type Walkthrough = Walkthroughs["walkthroughs"][number];
export type WalkthroughStep = Walkthrough["steps"][number];
export type WalkthroughBeat = WalkthroughStep["beats"][number];
// a group name plays that group in order
export type WalkthroughRequest = WalkthroughId | Walkthrough["group"];
export function walkthroughGroupLabel(
  { groups }: Pick<Walkthroughs, "groups">,
  id: Walkthrough["group"],
): string {
  const group = groups.find((entry) => entry.id === id);
  if (group === undefined) {
    throw new Error(`The ${id} Walkthrough group is missing.`);
  }
  return group.label;
}
// Play all's place in its group, as "Primary 2 of 6"
export interface PlayOrder {
  label: string;
  at: number;
  total: number;
}

export const WALKTHROUGH_SPEEDS = [1, 1.5, 2, 3] as const;
export const DEFAULT_SPEED = 2;
export type WalkthroughSpeed = (typeof WALKTHROUGH_SPEEDS)[number];

export function walkthroughHoldMs(
  text: string,
  speed: WalkthroughSpeed,
  timing: Walkthroughs["timing"],
): number {
  const words = text.split(/\s+/).filter((word) => word !== "").length;
  return Math.max(timing.captionMinMs, words * timing.wordMs) / speed;
}

// the player loads after the first page, so a request made before it waits for it
const requests = listeners<[request: WalkthroughRequest]>();
let players = 0;
let waiting: WalkthroughRequest | null = null;

export function requestWalkthrough(request: WalkthroughRequest): void {
  if (players === 0) {
    waiting = request;
  } else {
    requests.emit(request);
  }
}

export function onWalkthroughRequest(listener: (request: WalkthroughRequest) => void): () => void {
  players += 1;
  const stop = requests.subscribe(listener);
  const asked = waiting;
  waiting = null;
  if (asked !== null) {
    listener(asked);
  }
  return () => {
    players -= 1;
    stop();
  };
}

// the demo shell provides it, and no screen reads it
export const WalkthroughsContext = createContext<Walkthroughs | null>(null);

interface WalkthroughOffer {
  walkthrough: Walkthrough;
  unavailable: string | null;
}

// recorded answers stand in when live Pebble is off, so every Walkthrough plays
export function walkthroughOffers({ walkthroughs }: Walkthroughs): WalkthroughOffer[] {
  return walkthroughs.map((walkthrough) => ({
    walkthrough,
    unavailable: walkthrough.unavailable ?? null,
  }));
}

const isGroup = (request: WalkthroughRequest): request is Walkthrough["group"] =>
  WalkthroughGroupSchema.safeParse(request).success;

// one by its id, or a group's playable ones in order
export function requestedIds(
  offers: readonly WalkthroughOffer[],
  request: WalkthroughRequest,
): WalkthroughId[] {
  if (!isGroup(request)) {
    return [request];
  }
  return offers.flatMap(({ walkthrough, unavailable }) =>
    walkthrough.group === request && unavailable === null && walkthrough.waits !== true
      ? [walkthrough.id]
      : [],
  );
}

export function useWalkthroughs(): Walkthroughs {
  const walkthroughs = use(WalkthroughsContext);
  if (walkthroughs === null) {
    throw new Error("Pages render inside an Agent");
  }
  return walkthroughs;
}

export function useWalkthroughOffers(): WalkthroughOffer[] {
  return walkthroughOffers(useWalkthroughs());
}

const ProgressSchema = z.strictObject({ done: z.array(z.enum(WALKTHROUGH_IDS)) });
type GetStartedProgress = z.infer<typeof ProgressSchema>;

class GetStartedStore extends SavedStore<GetStartedProgress> {
  #touched = false;

  getSnapshot = (): GetStartedProgress => this.saved;

  tick(id: WalkthroughId): void {
    if (!this.saved.done.includes(id)) {
      this.#save({ done: [...this.saved.done, id] });
    }
  }

  clear(): void {
    this.#save({ done: [] });
  }

  // a Walkthrough puts storage back as it found it, so ticks made since are written over it
  keep(): void {
    if (this.#touched) {
      this.persist();
    }
  }

  #save(next: GetStartedProgress): void {
    this.#touched = true;
    this.commit(next);
  }
}

// browser-wide since the Walkthroughs play across Agents, and only Reset demo clears it
export const getStarted = new GetStartedStore(
  localPersistence(GET_STARTED_KEY),
  (raw) => ProgressSchema.parse(raw),
  { done: [] },
);

// a playing Walkthrough hides the Get started row
let presenting = false;
const presentings = listeners();

export function setPresenting(next: boolean): void {
  if (next !== presenting) {
    presenting = next;
    presentings.emit();
  }
}

export function usePresenting(): boolean {
  return useSyncExternalStore(presentings.subscribe, () => presenting);
}
