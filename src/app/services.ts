// the only product module that selects the demo Org
import type { ComponentType, ReactNode } from "react";
import { z } from "zod";

import type { ControlPlane, ProductClient } from "#src/queries/client";

// the client the control plane supplies for each Org, the signed-in user's Orgs, and an optional Org shell
export interface Services extends ControlPlane {
  /** The signed-in user's id, which records such as a sandbox's creator name. */
  viewer: string;
  Shell?: ComponentType<{ children: ReactNode }> | undefined;
}

const SET_ENV =
  "Set VITE_GROUNDED_API_URL, VITE_GROUNDED_ORG, VITE_GROUNDED_TOKEN and VITE_GROUNDED_USER";

const PLATFORM_ENV = z.object({
  VITE_GROUNDED_API_URL: z.url(),
  VITE_GROUNDED_ORG: z.uuid(),
  VITE_GROUNDED_TOKEN: z.string().min(1),
  VITE_GROUNDED_USER: z.uuid(),
});

async function platformServices(): Promise<Services | null> {
  const set = import.meta.env;
  if (set.VITE_GROUNDED_API_URL === undefined && set.VITE_GROUNDED_ORG === undefined) {
    return null;
  }
  const env = PLATFORM_ENV.safeParse(set).data;
  if (env === undefined) {
    throw new Error(`${SET_ENV} together`);
  }
  const orgId = env.VITE_GROUNDED_ORG;
  const credentials = { token: env.VITE_GROUNDED_TOKEN, apiBaseUrl: env.VITE_GROUNDED_API_URL };
  const auth = { type: "token", orgId, credentials: () => credentials } as const;
  // the platform client and its Pebble socket load only when an Org is configured
  const { GroundedClient } = await import("#src/sdk/client");
  const client: ProductClient = { ...new GroundedClient({ auth }), orgId };
  const check = (id: string) => {
    if (id !== orgId) {
      throw new Error(`No connection for Org ${id}`);
    }
  };
  return {
    // a data plane token can't read the Org's name or the user's email, which platform's control plane holds
    organizations: [{ id: orgId, name: orgId }],
    email: null,
    viewer: env.VITE_GROUNDED_USER,
    client: (id) => {
      check(id);
      return client;
    },
  };
}

let loaded: Services | undefined;

async function chosenServices(): Promise<Services> {
  const platform = await platformServices();
  if (platform !== null) {
    return platform;
  }
  return (await import("#src/demo/services")).demoServices;
}

// runs before the router starts
export async function loadServices(): Promise<Services> {
  loaded = await chosenServices();
  return loaded;
}

/** The services the app started with, for the Org shell and pages that name the viewer. */
export function currentServices(): Services {
  if (loaded === undefined) {
    throw new Error("Services load before the router starts");
  }
  return loaded;
}
