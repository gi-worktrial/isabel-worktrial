export interface SavedScope {
  orgId: string;
  agentId: string;
}

// bump the version when the saved shape changes
const SAVED = "grounded.saved.v8";

function scoped(prefix: string, { orgId, agentId }: SavedScope): string {
  return [prefix, ...[orgId, agentId].map(encodeURIComponent)].join(":");
}

export function agentStorageKey(scope: SavedScope): string {
  return scoped(SAVED, scope);
}

export function agentPartKey(scope: SavedScope, part: "layer"): string {
  return `${agentStorageKey(scope)}:${part}`;
}

// which side Pebble's panel docks on, and the widths of the page and Pebble
export const PANES_KEY = "grounded.panes.v1";
export const PANE_WIDTHS_KEY = "grounded.pebble.v1";
