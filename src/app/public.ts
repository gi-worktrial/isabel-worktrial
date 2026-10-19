// the product's one door from src/app for the optional Org shell (the demo) and for platform's shell in src/platform
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouteContext, useRouter } from "@tanstack/react-router";
import { createContext, type ReactNode, useCallback, useSyncExternalStore } from "react";

import { getActiveAgent } from "#/last-visited-agent";
import { agentKey, agentsQuery } from "#/queries";
import type { ProductClient } from "#src/queries/client";
import { listeners } from "#src/ui/listeners";

export { otherSide, panes, type PaneSide, usePebbleSide } from "#src/app/panes";
export type { Services } from "#src/app/services";
export { useQueryClient } from "@tanstack/react-query";
export { useLocation, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
export {
  browserStorageSnapshot,
  clearAgentStorage,
  localPersistence,
  SavedStore,
} from "#src/data/storage";
export { listeners } from "#src/ui/listeners";
export { usePaletteGroups } from "#src/ui/palette-groups";
export { setTheme, type Theme, useTheme } from "#/ui/theme";

/** A control a data plane docks at the start of the sidebar's bottom row, before Ask Pebble, drawn as an icon in the rail. */
export const SidebarExtra = createContext<((collapsed: boolean) => ReactNode) | null>(null);

/** The Org client and the Agent in view, which the optional Org shell acts on. */
export type Connection = { client: ProductClient; agentId: string };

/** The Agent in view, else the active one the sidebar keeps on Org pages and chats, or null with no Agents. */
export function useConnection(): Connection | null {
  const { client } = useRouteContext({ from: "/$orgId" });
  const { agent } = useParams({ strict: false });
  const agents = useQuery({
    ...agentsQuery({ orgId: client.orgId }),
    enabled: agent === undefined,
  });
  const active = agent ?? getActiveAgent(client.orgId, agents.data ?? []);
  return active === undefined ? null : { client, agentId: active };
}

/** Rereads every mounted or cached read of the Agent after the viewer's state is restored. */
export function refreshReview(cache: QueryClient, connection: Connection): Promise<void> {
  return cache.invalidateQueries({
    queryKey: agentKey({ orgId: connection.client.orgId, agent: connection.agentId }),
    refetchType: "all",
  });
}

// browser interactions the optional Org shell reaches through the product boundary
export function useShell() {
  const connection = useConnection();
  const queryClient = useQueryClient();
  const router = useRouter();
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ refetchType: "all" });
    await router.invalidate();
  }, [queryClient, router]);
  return { connection, refresh };
}

// each reset or put back starts the Agent's pages again, so open conversations stop and drafts read storage afresh
const renewals = listeners();
let generation = 0;

export function renewViewer(): void {
  generation += 1;
  renewals.emit();
}

export function useViewerGeneration(): number {
  return useSyncExternalStore(renewals.subscribe, () => generation);
}
