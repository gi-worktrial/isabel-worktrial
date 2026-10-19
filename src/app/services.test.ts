import { afterEach, expect, it, vi } from "vitest";

import { agentPartKey } from "#src/data/storage-keys";
import { emptyLayer } from "#src/demo/plane/client";
import type { listAgents, scenarioFiles } from "#src/demo/plane/load";
import { stubStorage } from "#test/storage";

const ORG = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000002";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.doUnmock("#src/demo/plane/load");
});

// the Org's chat titles, in name order since chats made in the same millisecond tie on time
const titles = async (client: {
  pebble: { threads: { list(): Promise<{ threads: Array<{ title: string | null }> }> } };
}) => (await client.pebble.threads.list()).threads.map(({ title }) => title).toSorted();

// a scenario's Walkthroughs with none authored
const noWalkthroughs = async (agent: string) => ({
  agent: { agentId: agent, name: agent },
  groups: [
    { id: "story", label: "Primary" },
    { id: "features", label: "Features" },
  ],
  timing: { captionMinMs: 2500, wordMs: 300, preparationMs: 800, restMs: 2000 },
  walkthroughs: [],
});

// a fresh services module over the given fetch, on platform's Org when native
async function servicesWith(fetch: (url: string) => Response, native = false) {
  if (native) {
    vi.stubEnv("VITE_GROUNDED_API_URL", "https://api.example.com");
    vi.stubEnv("VITE_GROUNDED_ORG", ORG);
    vi.stubEnv("VITE_GROUNDED_TOKEN", "token");
    vi.stubEnv("VITE_GROUNDED_USER", USER);
  }
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => fetch(url)),
  );
  return (await import("#src/app/services")).loadServices();
}

// the first import transforms the whole demo module, which takes over 5s while the suite runs in parallel
it("opens the first Agent in the catalog", async () => {
  const services = await servicesWith(() =>
    Response.json({ agents: [{ agentId: "from-catalog", name: "From catalog", mark: null }] }),
  );
  const [org] = services.organizations;
  const [first] = await services.client(org?.id ?? "").agents.list();
  expect({ orgId: org?.id, agent: first?.name }).toEqual({
    orgId: "demo",
    agent: "from-catalog",
  });
  expect(fetch).toHaveBeenCalledWith("/scenarios/index.json");
}, 20000);

it("connects native chats to platform's thread socket", async () => {
  const services = await servicesWith(() => Response.json({ threads: [], has_more: false }), true);
  const thread = crypto.randomUUID();
  const options = await services.client(ORG).pebble.threads.connectionOptions(thread);
  expect(options).toMatchObject({
    agent: "pebble",
    host: "api.example.com",
    protocol: "wss",
    basePath: `orgs/${ORG}/pebble/${thread}`,
  });
  expect(options.WebSocket).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});

it("native catalogs include Agents before their files are provisioned", async () => {
  const services = await servicesWith((url) => {
    if (new URL(url).pathname !== `/orgs/${ORG}/agents`) {
      throw new Error(`Unprovisioned Agent has no repository: ${url}`);
    }
    const created = { id: ORG, created_by: USER, created_at: "2026-09-29T00:00:00Z" };
    return Response.json({
      agents: ["ready", "new-agent"].map((name) => ({ name, repo: name, ...created })),
    });
  }, true);
  expect(
    (await services.client(ORG).agents.list()).map(({ name, repo: repository }) => ({
      name,
      repo: repository,
    })),
  ).toEqual([
    { name: "ready", repo: "ready" },
    { name: "new-agent", repo: "new-agent" },
  ]);
  expect(services.client(ORG).orgId).toBe(ORG);
  expect(services.Shell).toBeUndefined();
  expect(() => services.client("another-org")).toThrow("No connection for Org another-org");
});

it("native Pebble refusal rejects the chat list without loading demo resources", async () => {
  const services = await servicesWith(
    () => Response.json({ error: "Denied" }, { status: 403 }),
    true,
  );
  await expect(services.client(ORG).pebble.threads.list({ limit: 1 })).rejects.toMatchObject({
    status: 403,
  });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    `https://api.example.com/orgs/${ORG}/pebble?limit=1`,
    expect.anything(),
  );
});

it("partial native configuration fails before any fallback or request", async () => {
  vi.stubEnv("VITE_GROUNDED_ORG", ORG);
  await expect(servicesWith(() => Response.json({}))).rejects.toThrow("Set VITE_GROUNDED_API_URL");
  expect(fetch).not.toHaveBeenCalled();
});

it("the Org client loads one Agent lazily, isolates its writes, and restores every opened Agent", async () => {
  const { tinySeed } = await import("#test/tiny-seed");
  const seed = await tinySeed();
  const catalog = vi.fn<typeof listAgents>(async () =>
    ["first", "second", "visited"].map((agentId) => ({ agentId, name: agentId, mark: null })),
  );
  const files = vi.fn<typeof scenarioFiles>(async (agent: string, orgId: string) => ({
    seed: { ...structuredClone(seed), agent, org_id: orgId },
  }));
  vi.doMock("#src/demo/plane/load", () => ({
    listAgents: catalog,
    scenarioFiles: files,
    walkthroughFile: noWalkthroughs,
  }));
  const services = await servicesWith(() => {
    throw new Error("No model or network call expected");
  });
  const client = services.client("demo");
  expect((await client.agents.list()).map(({ name }) => name)).toEqual([
    "first",
    "second",
    "visited",
  ]);
  expect(files).not.toHaveBeenCalled();
  const branches = await Promise.all([
    client.repos.listBranches({ repo: "first" }),
    client.repos.listBranches({ repo: "first" }),
  ]);
  expect(branches[0]).toEqual(branches[1]);
  expect(files).toHaveBeenCalledExactlyOnceWith("first", "demo");
  await client.pebble.threads.create({
    repos: ["first"],
    title: "Before first",
    model: "model",
  });
  await client.pebble.threads.create({
    repos: ["second"],
    title: "Before second",
    model: "model",
  });
  const { snapshotViewer, resetViewer } = await import("#src/demo/reset");
  const restore = snapshotViewer(client);
  resetViewer({ client, agentId: "first" });
  expect(await titles(client)).toEqual(["Before second"]);
  await client.pebble.threads.create({
    repos: ["first"],
    title: "During first",
    model: "model",
  });
  await client.pebble.threads.create({
    repos: ["second"],
    title: "During second",
    model: "model",
  });
  await client.pebble.threads.create({
    repos: ["visited"],
    title: "During visit",
    model: "model",
  });
  restore();
  expect(await titles(client)).toEqual(["Before first", "Before second"]);
  await client.pebble.threads.create({
    repos: ["first"],
    title: "After restore",
    model: "model",
  });
  expect(await titles(client)).toEqual(["After restore", "Before first", "Before second"]);
  expect((await client.pebble.threads.list()).threads[0]?.title).toBe("After restore");
  expect(files.mock.calls.filter(([agent]) => agent === "first")).toHaveLength(1);
  expect(files.mock.calls.filter(([agent]) => agent === "second")).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
});

async function threadServices() {
  const { tinySeed } = await import("#test/tiny-seed");
  const seed = await tinySeed();
  const stored = stubStorage();
  vi.doMock("#src/demo/plane/load", () => ({
    walkthroughFile: noWalkthroughs,
    listAgents: async () =>
      ["first", "second"].map((agentId) => ({ agentId, name: agentId, mark: null })),
    scenarioFiles: async (agent: string, orgId: string) => ({
      seed: { ...structuredClone(seed), agent, org_id: orgId },
    }),
  }));
  const services = await servicesWith((url) => {
    throw new Error(`Unexpected request ${url}`);
  });
  return { services, client: services.client("demo"), stored };
}

function restoredThread(id: string, title: string): string {
  const layer = emptyLayer();
  const at = Date.now();
  layer.threads.push({ id, title, created_ms: at, updated_ms: at });
  return JSON.stringify(layer);
}

it("the same Org thread list reads externally restored layers without a repository read", async () => {
  const { services, client, stored } = await threadServices();
  const first = await client.pebble.threads.create({
    repos: ["first"],
    title: "Original first",
    model: "model",
  });
  await client.pebble.threads.create({
    repos: ["second"],
    title: "Original second",
    model: "model",
  });
  expect(await titles(client)).toEqual(["Original first", "Original second"]);
  stored.set(
    agentPartKey({ orgId: "demo", agentId: "first" }, "layer"),
    restoredThread(first.id, "External first"),
  );
  expect(services.client("demo")).toBe(client);
  expect(await titles(client)).toEqual(["External first", "Original second"]);
  expect(fetch).not.toHaveBeenCalled();
});

it("the same Org connects only thread IDs present in externally restored layers", async () => {
  const { client, stored } = await threadServices();
  const original = await client.pebble.threads.create({
    repos: ["first"],
    title: "Original first",
    model: "model",
  });
  await client.pebble.threads.create({
    repos: ["second"],
    title: "Original second",
    model: "model",
  });
  const restored = crypto.randomUUID();
  stored.set(
    agentPartKey({ orgId: "demo", agentId: "first" }, "layer"),
    restoredThread(restored, "External replacement"),
  );
  const connection = await client.pebble.threads.connectionOptions(restored);
  expect(connection.basePath).toBe(`pebble/${restored}`);
  expect(connection.WebSocket).toBeDefined();
  await expect(client.pebble.threads.connectionOptions(original.id)).rejects.toMatchObject({
    status: 404,
  });
});

it("the same Org archives a chat in its Agent's layer, and still reads it by id", async () => {
  const { client } = await threadServices();
  const first = await client.pebble.threads.create({
    repos: ["first"],
    title: "Original first",
    model: "model",
  });
  await client.pebble.threads.create({
    repos: ["second"],
    title: "Original second",
    model: "model",
  });
  await client.pebble.threads.update(first.id, { archived: true });
  expect(await titles(client)).toEqual(["Original second"]);
  expect(await client.pebble.threads.get(first.id)).toMatchObject({ archived: true });
  expect(await client.pebble.threads.update(first.id, { archived: false })).toMatchObject({
    archived: false,
  });
  expect(await titles(client)).toEqual(["Original first", "Original second"]);
});

it("a saved layer from an older seed keeps its chats, so the list only names chats that open", async () => {
  const { client, stored } = await threadServices();
  const id = crypto.randomUUID();
  const layer = JSON.parse(restoredThread(id, "Before the seed changed")) as ReturnType<
    typeof emptyLayer
  >;
  layer.objects.refs["refs/heads/main"] = "0".repeat(40);
  stored.set(agentPartKey({ orgId: "demo", agentId: "first" }, "layer"), JSON.stringify(layer));
  expect(await titles(client)).toEqual(["Before the seed changed"]);
  const connection = await client.pebble.threads.connectionOptions(id);
  expect(connection.basePath).toBe(`pebble/${id}`);
  expect(await titles(client)).toEqual(["Before the seed changed"]);
});
