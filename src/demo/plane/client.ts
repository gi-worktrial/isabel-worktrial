import type { PebbleAnswer, PebbleRequest } from "#src/pebble/wire";
import type { ProductClient } from "#src/queries/client";
import { type Agent, type GroundedClient, Evals } from "#src/sdk/index";
import { Issues } from "#src/sdk/issues";

import { type Plane, refusal, VIEWER, VIEWER_EMAIL } from "./access.ts";
import { agentIdOf, agentsResource } from "./agents.ts";
import { rebased } from "./clock.ts";
import { GitError, gitDate, MemoryGit } from "./git.ts";
import { installationsResource } from "./github.ts";
import { jobsService } from "./jobs.ts";
import { type Layer, registerReset } from "./layer.ts";
import { modelUsage } from "./models.ts";
import { pullsService } from "./pulls.ts";
import { reposResource } from "./repos.ts";
import { sandboxUsage } from "./sandboxes.ts";
import type { Seed } from "./seed/types.ts";
import { type ThreadRecord, threadOf, threadsResource } from "./threads.ts";

export { VIEWER, VIEWER_EMAIL } from "./access.ts";
export { emptyLayer, type Layer, layerFits } from "./layer.ts";
export type { Seed } from "./seed/types.ts";

const OPERATORS_ONLY = "Only the data plane's operators see its deployment";

type MemoryClientOptions = {
  now?: (() => number) | undefined;
  // called after every write so the layer can be saved
  saved?: ((layer: Layer) => void) | undefined;
  // the answer demo-data prepared for a suggested prompt, if any
  prepared?: ((request: PebbleRequest) => Promise<PebbleAnswer | undefined>) | undefined;
};

// the services' classes are typed by their private api field, so the demo's resources stand in by their public methods
type Resources = Pick<GroundedClient, "repos" | "git" | "pulls" | "agents" | "jobs">;
const asNative = (resources: Pick<ProductClient, keyof Resources>) =>
  resources as unknown as Resources;

/** The demo's in-browser data plane for one Agent: platform's client, served from its seed and the viewer's layer. */
export function memoryClient(
  source: Seed,
  layer: Layer,
  options: MemoryClientOptions = {},
): ProductClient {
  const now = options.now ?? Date.now;
  const { seed, at: seedTime } = rebased(source, now());
  const git = new MemoryGit(seed.repo, layer.objects, seedTime);
  const commits = Object.values(seed.repo.commits);
  const agent: Agent = {
    id: agentIdOf(seed.agent),
    name: seed.agent,
    repo: seed.agent,
    created_by: VIEWER,
    created_at: commits.map((commit) => commit.committer.date).toSorted()[0]!,
  };
  // the person whose Issue actions the seed's review committed, whom the viewer signs as
  const reviewer = commits.find(
    ({ author, message }) =>
      !author.email.endsWith("@grounded.ai") && /^Grounded-Action: /mu.test(message),
  )?.author;

  let lifetime = new AbortController();
  // a call naming a repo answers only for the demo's own
  const read = async <Value>(
    answer: () => Value | Promise<Value>,
    repo = seed.repository,
  ): Promise<Value> => {
    lifetime.signal.throwIfAborted();
    if (repo !== seed.repository && repo !== seed.agent) {
      throw new GitError("Repository not found", 404);
    }
    return await answer();
  };
  const write = async <Value>(
    change: () => Value | Promise<Value>,
    repo = seed.repository,
  ): Promise<Value> => {
    const value = await read(change, repo);
    lifetime.signal.throwIfAborted();
    options.saved?.(layer);
    return value;
  };
  const plane: Plane = {
    seed,
    git,
    now,
    read,
    write,
    head: (branch) => git.refs()[`refs/heads/${branch}`] ?? undefined,
    signature: () => ({
      name: reviewer?.name ?? "Reviewer",
      email: reviewer?.email ?? VIEWER_EMAIL,
      date: gitDate(now()),
    }),
  };

  // a branch move merges the pull requests whose head it reached, then runs the push and pull request triggers
  const { mergeBranch, ...repos } = reposResource(plane, async (branch, before, after) => {
    pulls.reached(branch, after);
    await jobs.pushed(branch, before, after);
  });
  const pulls = pullsService(plane, layer, {
    user: `user:${VIEWER}`,
    opened: (pull) => jobs.opened(pull),
    mergeBranch,
  });
  const jobs = jobsService(plane, layer, pulls);
  const agents = agentsResource(plane, agent, jobs.runs);
  const native = asNative({ ...repos, pulls: pulls.resource, agents, jobs: jobs.resource });
  const evals = new Evals(native.repos, native.agents, native.jobs);
  // the models its Eval trials called, from the recordings they replay
  const recordings = new Map(seed.traces.map((trace) => [trace.trace_id, trace]));
  const models = modelUsage(
    () => jobs.runs(),
    async (id) => (seed.loadTrace === undefined ? recordings.get(id) : await seed.loadTrace(id)),
    now,
  );
  const refuse = (message: string) => () => read(refusal(message));
  const thread = (record: ThreadRecord) => threadOf(record, seed.repository);
  const client: ProductClient = {
    orgId: seed.org_id,
    ...repos,
    pulls: pulls.resource,
    agents,
    jobs: jobs.resource,
    evals,
    issues: new Issues(native.repos, native.git, native.agents, native.pulls, native.jobs, evals),
    settings: {
      models: () => read(models.models),
      createModel: refuse("The demo can't add models"),
      deleteModel: refuse("The demo can't remove models"),
      usage: (range) => read(() => models.usage(range)),
    },
    // a data plane's deployment is its operators' page, and the demo viewer isn't one
    deployment: {
      models: refuse(OPERATORS_ONLY),
      createModel: refuse(OPERATORS_ONLY),
      deleteModel: refuse(OPERATORS_ONLY),
      usage: refuse(OPERATORS_ONLY),
    },
    installations: installationsResource(() => read(() => [seed.repository])),
    pebble: threadsResource({
      threads: layer.threads,
      thread,
      now,
      read,
      write,
      prepared: options.prepared ?? (async () => undefined),
    }),
    sandboxes: {
      usage: () =>
        read(() =>
          sandboxUsage({
            agentId: agent.id,
            viewer: VIEWER,
            runs: jobs.runs().map(({ run }) => run),
            threads: layer.threads,
            now: now(),
          }),
        ),
    },
  };
  const restore = (saved: Layer) => {
    lifetime.abort();
    lifetime = new AbortController();
    pulls.reset();
    jobs.reset();
    git.restore(saved.objects);
    layer.runs = structuredClone(saved.runs);
    layer.pulls = structuredClone(saved.pulls);
    layer.threads.splice(0, layer.threads.length, ...structuredClone(saved.threads));
  };
  registerReset(client, {
    // the viewer's objects stay unreachable, as git keeps them
    reset: () => {
      const { objects } = structuredClone(layer);
      for (const name of Object.keys(objects.refs)) {
        objects.refs[name] = seed.repo.refs[name] ?? null;
      }
      restore({ objects, runs: [], pulls: [], threads: [] });
    },
    snapshot: () => {
      const before = structuredClone(layer);
      return () => restore(before);
    },
  });
  return client;
}
