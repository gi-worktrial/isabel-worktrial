import { z } from "zod";

import type { Services } from "#src/app/public";
import { localPersistence, readQuietly, readSaved, writeQuietly } from "#src/data/storage";
import { agentPartKey } from "#src/data/storage-keys";
import { agentIdOf } from "#src/demo/plane/agents";
import {
  type PreparedAnswer,
  preparedAnswer,
  PreparedAnswersSchema,
  screenAgent,
} from "#src/demo/plane/answers";
import {
  emptyLayer,
  type Layer,
  layerFits,
  memoryClient,
  VIEWER,
  VIEWER_EMAIL,
} from "#src/demo/plane/client";
import { connectedRepository, installationsResource } from "#src/demo/plane/github";
import { registerReset, viewerLayer } from "#src/demo/plane/layer";
import { summedUsage, usageRange } from "#src/demo/plane/models";
import { SANDBOX_LIMIT } from "#src/demo/plane/sandboxes";
import { JobRunSchema } from "#src/demo/plane/seed/runs";
import { threadOf, type ThreadRecord } from "#src/demo/plane/threads";
import type { ProductClient } from "#src/queries/client";
import { type Agent, GroundedError, type Thread } from "#src/sdk/index";

import { answersFile, listAgents, scenarioFiles, walkthroughFile } from "./plane/load.ts";
import { DEMO_ORG, openedDemos, walkthroughsOf, type Written } from "./session.ts";
import { DemoShell } from "./shell.tsx";
import { WalkthroughsSchema } from "./walkthrough/state.ts";

const threadSchema = z.strictObject({
  id: z.string(),
  title: z.string().nullable(),
  created_ms: z.number(),
  updated_ms: z.number(),
  archived: z.boolean().optional(),
  sessions: z
    .record(
      z.string(),
      z.strictObject({
        parent: z.string().nullable(),
        entries: z.array(z.looseObject({ id: z.number(), kind: z.string() })),
        model: z.string().nullable(),
      }),
    )
    .optional(),
});

// a save in another shape starts the Agent over
const layerSchema = z.object({
  objects: z.object({
    blobs: z.record(z.string(), z.string()),
    trees: z.record(z.string(), z.array(z.json())),
    commits: z.record(z.string(), z.json()),
    refs: z.record(z.string(), z.string().nullable()),
  }),
  runs: z.array(
    z.looseObject({
      run: JobRunSchema,
      created_ms: z.number(),
    }),
  ),
  pulls: z.array(z.json()),
  threads: z.array(threadSchema),
});

const loading = new Map<string, Promise<ProductClient>>();
// each Agent's answers to its suggested prompts, read on the first question about it; a failed read leaves the
// prompts to the offline reply and is tried again next time
const answers = new Map<string, Promise<readonly PreparedAnswer[]>>();
function answersOf(agentId: string): Promise<readonly PreparedAnswer[]> {
  let known = answers.get(agentId);
  if (known === undefined) {
    known = answersFile(agentId, PreparedAnswersSchema).then(
      (file) => file.answers,
      () => {
        answers.delete(agentId);
        return [];
      },
    );
    answers.set(agentId, known);
  }
  return known;
}

// seed files load on first read and simultaneous reads share that load
async function openAgent(agentId: string): Promise<ProductClient> {
  const known = openedDemos.get(agentId);
  if (
    known !== undefined &&
    !known.layer.stale &&
    known.layer.raw === readQuietly(localPersistence(known.layer.key))
  ) {
    return known.client;
  }
  const pending = loading.get(agentId);
  if (pending !== undefined) {
    return pending;
  }
  const next = loadAgent(agentId);
  loading.set(agentId, next);
  try {
    return await next;
  } finally {
    loading.delete(agentId);
  }
}

async function loadAgent(agentId: string): Promise<ProductClient> {
  const [{ seed }, walkthroughs] = await Promise.all([
    scenarioFiles(agentId, DEMO_ORG),
    walkthroughFile(agentId, WalkthroughsSchema),
  ]);
  const key = agentPartKey({ orgId: DEMO_ORG, agentId: seed.agent }, "layer");
  const persistence = localPersistence(key);
  const raw = readQuietly(persistence);
  // SAFETY: the schema checks the saved layer's outline, and only this module writes it
  const saved = readSaved(persistence, (json) => layerSchema.parse(json)) as Layer | null;
  // a seed built since the save drops the viewer's repository changes, but not their chats, which the list read
  const layer =
    saved !== null && layerFits(seed, saved)
      ? saved
      : { ...emptyLayer(), threads: savedThreads(seed.agent) };
  const written: Written = { key, raw, stale: false };
  const client = memoryClient(seed, layer, {
    // a chat keeps its Agent while the engineer moves to another's page, so the screen picks whose answers apply
    prepared: async (request) =>
      preparedAnswer(await answersOf(screenAgent(request.context) ?? agentId), request),
    saved: (value) => {
      if (written.stale) {
        throw new GroundedError(
          "Another tab saved first, so this page now shows its version",
          409,
          undefined,
        );
      }
      writeQuietly(persistence, JSON.stringify(value));
      // denied browser storage still keeps this page's memory client warm
      written.raw = readQuietly(persistence);
    },
  });
  walkthroughsOf.set(agentId, walkthroughs);
  openedDemos.set(agentId, { layer: written, client });
  return client;
}

let catalog: Promise<Agent[]> | undefined;
function agents(): Promise<Agent[]> {
  catalog ??= listAgents()
    .then((entries) =>
      entries.map(({ agentId }) => ({
        id: agentIdOf(agentId),
        name: agentId,
        repo: agentId,
        created_by: VIEWER,
        created_at: "",
      })),
    )
    .catch((error: unknown) => {
      catalog = undefined;
      throw error;
    });
  return catalog;
}

type Opened = Awaited<ReturnType<typeof openAgent>>;
// each call goes to the Agent its `agent`, `repo` or run target names
type Routed = { agent?: string; repo?: string };
const nameOf = (options: unknown) => {
  const { agent, repo } = (options ?? {}) as Routed;
  const name = agent ?? repo;
  if (name === undefined) {
    throw new GroundedError("A demo call names its Agent or repo", 422, undefined);
  }
  return name;
};
function routed<Key extends keyof Opened>(
  resource: Key,
  own: Partial<Opened[Key]> = {},
): Opened[Key] {
  // SAFETY: every property is its own method or forwards to the same resource of the Agent the call names
  return new Proxy(own, {
    get: (target, method: string) =>
      method in target
        ? target[method as keyof typeof target]
        : async (...args: unknown[]) => {
            const opened = (await openAgent(nameOf(args[0])))[resource] as Record<
              string,
              (...rest: unknown[]) => unknown
            >;
            if (typeof opened[method] !== "function") {
              throw new GroundedError(
                `The demo has no ${String(resource)}.${method}`,
                501,
                undefined,
              );
            }
            return opened[method](...args);
          },
  }) as Opened[Key];
}
// a thread lives in one Agent's layer, so an Agent not opened yet lists its chats from its saved layer without
// loading its seed, and only the Agent whose chat is opened loads
const layerKey = (agentId: string) => agentPartKey({ orgId: DEMO_ORG, agentId }, "layer");
// read as the opened Agent reads them, so the list never names a chat its Agent can't open
const SavedThreadsSchema = z.object({ threads: z.array(threadSchema) });
function savedThreads(agentId: string): ThreadRecord[] {
  // SAFETY: the schema checks the chats' outline as the layer's does, and only this module writes them
  const saved = readSaved(localPersistence(layerKey(agentId)), (json) =>
    SavedThreadsSchema.parse(json),
  ) as { threads: ThreadRecord[] } | null;
  return saved?.threads ?? [];
}

async function chatsOf(agentId: string): Promise<Thread[]> {
  if (openedDemos.has(agentId)) {
    return (await (await openAgent(agentId)).pebble.threads.list()).threads;
  }
  return savedThreads(agentId)
    .filter((record) => record.archived !== true)
    .map((record) => threadOf(record, agentId));
}

// read by id, since the list leaves archived chats out; an opened Agent answers from its client, which holds the
// chats made since its layer was read
async function threadOwner(id: string) {
  for (const { name } of await agents()) {
    const holds = openedDemos.has(name)
      ? await (await openAgent(name)).pebble.threads.get(id).then(Boolean, () => false)
      : savedThreads(name).some((record) => record.id === id);
    if (holds) {
      return openAgent(name);
    }
  }
  throw new GroundedError(`No Pebble thread ${id}`, 404, undefined);
}

const operatorsOnly = () =>
  Promise.reject(
    new GroundedError("Only the data plane's operators see its deployment", 403, undefined),
  );

const client: ProductClient = {
  orgId: DEMO_ORG,
  repos: routed("repos", {
    list: async () => (await agents()).map(({ repo }) => connectedRepository(repo)),
  }),
  git: routed("git"),
  pulls: routed("pulls"),
  jobs: routed("jobs"),
  // an opened Agent reports its own record, whose creation is its repo's first commit on the demo's clock
  agents: routed("agents", {
    list: async () =>
      Promise.all(
        (await agents()).map(async (agent) =>
          openedDemos.has(agent.name)
            ? (await openAgent(agent.name)).agents.get({ agent: agent.name })
            : agent,
        ),
      ),
  }),
  issues: routed("issues"),
  evals: routed("evals"),
  installations: installationsResource(async () => (await agents()).map(({ repo }) => repo)),
  settings: {
    models: async () => {
      const opened = await Promise.all((await agents()).map(({ name }) => openAgent(name)));
      const models = (await Promise.all(opened.map((agent) => agent.settings.models()))).flat();
      return [...new Map(models.map((model) => [model.id, model])).values()];
    },
    createModel: () =>
      Promise.reject(new GroundedError("The demo can't add models", 403, undefined)),
    deleteModel: () =>
      Promise.reject(new GroundedError("The demo can't remove models", 403, undefined)),
    // every Agent's Eval trials called the gateway's shared models
    usage: async (range = {}) => {
      const opened = await Promise.all((await agents()).map(({ name }) => openAgent(name)));
      return summedUsage(
        await Promise.all(opened.map((agent) => agent.settings.usage(range))),
        usageRange(range, Date.now()),
      );
    },
  },
  // a data plane's deployment is its operators' page, and the demo viewer isn't one
  deployment: {
    models: operatorsOnly,
    createModel: operatorsOnly,
    deleteModel: operatorsOnly,
    usage: operatorsOnly,
  },
  // every Agent's job runs and chats share the Org's one limit
  sandboxes: {
    usage: async () => {
      const usages = await Promise.all(
        (await agents()).map(async ({ name }) => (await openAgent(name)).sandboxes.usage()),
      );
      return {
        limit: SANDBOX_LIMIT,
        used: usages.reduce((sum, { used }) => sum + used, 0),
        sandboxes: usages.flatMap(({ sandboxes }) => sandboxes),
        reservations: usages.flatMap(({ reservations }) => reservations),
      };
    },
  },
  pebble: {
    threads: {
      list: async () => {
        const chats = await Promise.all((await agents()).map(({ name }) => chatsOf(name)));
        return {
          threads: chats
            .flat()
            .toSorted((left, right) => right.updated_at.localeCompare(left.updated_at)),
          has_more: false,
        };
      },
      get: async (id) => (await threadOwner(id)).pebble.threads.get(id),
      create: async (options) => {
        const [agent] = options.repos ?? [];
        if (agent === undefined || options.repos?.length !== 1) {
          throw new GroundedError("A demo thread belongs to one Agent", 422, undefined);
        }
        return (await openAgent(agent)).pebble.threads.create(options);
      },
      update: async (id, options) => (await threadOwner(id)).pebble.threads.update(id, options),
      connectionOptions: async (id) => (await threadOwner(id)).pebble.threads.connectionOptions(id),
    },
  },
};

// a Walkthrough can visit other Agents, so reset restores every opened plane and browser state
registerReset(client, {
  reset: (agentId) => {
    for (const [agent, opened] of openedDemos) {
      if (agentId === undefined || agent === agentId) {
        viewerLayer(opened.client)?.reset();
        opened.layer.raw = readQuietly(localPersistence(opened.layer.key));
        opened.layer.stale = false;
      }
    }
  },
  snapshot: () => {
    const saved = new Map(
      [...openedDemos].map(([agent, opened]) => [
        agent,
        {
          opened,
          restore: viewerLayer(opened.client)?.snapshot(),
          raw: opened.layer.raw,
        },
      ]),
    );
    return () => {
      for (const [agent, opened] of openedDemos) {
        const previous = saved.get(agent);
        if (previous === undefined || opened.client !== previous.opened.client) {
          viewerLayer(opened.client)?.reset();
          opened.layer.stale = true;
        }
      }
      for (const [agent, previous] of saved) {
        previous.restore?.();
        previous.opened.layer.raw = previous.raw;
        previous.opened.layer.stale = false;
        openedDemos.set(agent, previous.opened);
      }
    };
  },
});

export const demoServices: Services = {
  organizations: [{ id: DEMO_ORG, name: "Grounded" }],
  email: VIEWER_EMAIL,
  viewer: VIEWER,
  client: (orgId) => {
    if (orgId !== DEMO_ORG) {
      throw new Error(`No Org ${orgId} is connected`);
    }
    return client;
  },
  Shell: DemoShell,
};
