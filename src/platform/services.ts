// shim: platform's data plane clients come from the token endpoint; ours come from the services app/services.ts loads
// (the demo Org in memory, or a native Org's client)
import { clientFor, type ProductClient } from "#src/queries/client";

/** A client for one organization's data plane, which the browser calls directly. */
export function servicesClient(orgId: string): ProductClient {
  return clientFor(orgId);
}

/** Platform requests the Org's token ahead of its first call; our services hold their clients from the start. */
export function prefetchToken(_orgId: string): void {}
