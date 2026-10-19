import {
  browserStorageSnapshot,
  clearAgentStorage,
  type Connection,
  renewViewer,
} from "#src/app/public";
import { viewerLayer } from "#src/demo/plane/layer";
import type { ProductClient } from "#src/queries/client";

export { useViewerGeneration } from "#src/app/public";

export function snapshotViewer(client: ProductClient): () => void {
  const layer = viewerLayer(client);
  if (layer === undefined) {
    throw new Error("The demo client has no viewer Layer");
  }
  const restore = layer.snapshot();
  const restoreStorage = browserStorageSnapshot();
  return () => {
    restore();
    restoreStorage();
    renewViewer();
  };
}

// the Org client keeps the other Agents' layers intact
export function resetViewer({ client, agentId }: Pick<Connection, "client" | "agentId">): void {
  clearAgentStorage({ orgId: client.orgId, agentId });
  viewerLayer(client)?.reset(agentId);
  renewViewer();
}
