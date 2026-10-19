import { GroundedError } from "#src/sdk/api";
import type { GroundedClient } from "#src/sdk/client";
import type { ThreadConnectionOptions } from "#src/sdk/pebble";

// a class's public methods, so the demo's in-memory resources can stand in for platform's
type Surface<T> = { [Key in keyof T]: T[Key] };

/** Platform's thread socket options; the demo adds the `WebSocket` that serves the thread in the browser. */
export type ThreadConnection = ThreadConnectionOptions & {
  WebSocket?: typeof WebSocket | undefined;
};

/**
 * What screens call: platform's `GroundedClient` resources. Against a real Org this is
 * `new GroundedClient(...)`; the demo serves the same methods in memory and runs platform's own
 * `Issues` and `Evals` over them.
 */
export type ProductClient = {
  orgId: string;
  repos: Surface<GroundedClient["repos"]>;
  git: Surface<GroundedClient["git"]>;
  installations: Surface<GroundedClient["installations"]>;
  pulls: Surface<GroundedClient["pulls"]>;
  agents: Surface<GroundedClient["agents"]>;
  jobs: Surface<GroundedClient["jobs"]>;
  issues: Surface<GroundedClient["issues"]>;
  evals: Surface<GroundedClient["evals"]>;
  settings: Surface<GroundedClient["settings"]>;
  deployment: Surface<GroundedClient["deployment"]>;
  sandboxes: Surface<GroundedClient["sandboxes"]>;
  pebble: {
    threads: Pick<
      Surface<GroundedClient["pebble"]["threads"]>,
      "list" | "get" | "create" | "update"
    > & {
      connectionOptions(threadId: string): Promise<ThreadConnection>;
    };
  };
};

/** Whether a failed read tries again: twice at most, and never after a refusal the server would repeat. */
export const QUERY_RETRY = (failures: number, error: unknown) =>
  failures < 2 && !(error instanceof GroundedError && error.status < 500);

/** What the signed-in user may see and change in an Org, as platform's `getAccess` answers. */
export type Access = { email: string | null; tenant: boolean; admin: boolean; operator: boolean };

/**
 * What platform's control plane answers beside each Org's client: the signed-in user's Orgs and
 * email, which platform reads from its database and identity provider.
 */
export type ControlPlane = {
  client(orgId: string): ProductClient;
  organizations: ReadonlyArray<{ id: string; name: string }>;
  /** Null when the control plane can't name the user. */
  email: string | null;
};

let plane: ControlPlane | undefined;

/** Hands queries the control plane the router's services supply, once, before the router starts. */
export function provideClients(services: ControlPlane) {
  plane = services;
}

function controlPlane(): ControlPlane {
  if (plane === undefined) {
    throw new Error("Services load before the first query");
  }
  return plane;
}

/** The client for one Org's data plane, as platform's `servicesClient`. */
export function clientFor(orgId: string): ProductClient {
  return controlPlane().client(orgId);
}

/** The signed-in user's Orgs, as platform's `getOrganizations`. */
export async function getOrganizations() {
  return controlPlane().organizations;
}

/** Which sections the caller sees, as platform's `getAccess`, where every viewer is a tenant admin. */
export async function getAccess({ orgId }: { orgId: string }): Promise<Access> {
  const { organizations, email } = controlPlane();
  if (!organizations.some(({ id }) => id === orgId)) {
    throw new Error("Active membership required");
  }
  return { email, tenant: true, admin: true, operator: false };
}

/** What the services refuse in Settings, shown as the reason beside each disabled control. */
export const SETTINGS_LOCKS = {
  models: "The demo can't add models",
  invitations: "The demo can't send invitations",
  members: "The demo can't change members",
  github: "The demo can't connect GitHub accounts",
} as const;
