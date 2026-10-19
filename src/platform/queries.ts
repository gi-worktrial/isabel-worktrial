import {
  type CandidateSummary,
  type GroundedClient,
  type Repository,
  type EvalStatuses,
  type IssueSummary,
  type JobRun,
  type ListSessionsOptions,
  type UsageRange,
  EVALS_DIR,
  GroundedError,
  MANIFEST_PATH,
  decodeContent,
  getEvalsBranchById,
  getNotesDirById,
} from "@grounded-intelligence/grounded-sdk";
import {
  type QueryClient,
  infiniteQueryOptions,
  queryOptions,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";

import { JOB_OUTPUTS } from "./job-outputs";
import { getOrganizations } from "./db/organizations";
import { getAccess, getMemberNames, getOrganizationNames, listMembers } from "./members";
import { servicesClient } from "./services";

export const RUN_POLL_INTERVAL = 5000;
const SANDBOX_USAGE_POLL_INTERVAL = 5000;
const NOT_FOUND = 404;
const REPOS_PAGE_SIZE = 100;

type Org = { orgId: string };
type AgentParams = Org & { agent: string };
export type IssueParams = AgentParams & { issue: string };
type RunParams = AgentParams & { run: string };

// A run's trials reach ClickHouse after it completes, so its results keep arriving for a while.
const RESULTS_SETTLE_MS = 60_000;

export const isRunPending = ({ completed_at }: JobRun) =>
  completed_at === null || Date.now() - Date.parse(completed_at) < RESULTS_SETTLE_MS;
export const isCandidatePending = ({ results }: CandidateSummary) =>
  results === undefined || isRunPending(results.run);
export const isRunLive = ({ status }: JobRun | JobRun["steps"][number]) => status !== "completed";
const isIssuePending = ({ status }: IssueSummary) => status === "running";

/** Refetches every `RUN_POLL_INTERVAL` while `pending` holds for the data. */
const pollWhile =
  <T>(pending: (data: T) => boolean) =>
  ({ state }: { state: { data: T | undefined } }) =>
    state.data !== undefined && pending(state.data) ? RUN_POLL_INTERVAL : false;

const orgKey = (orgId: string) => ["orgs", orgId];
export const agentKey = ({ orgId, agent }: AgentParams) => [...orgKey(orgId), "agents", agent];
export const runsKey = (params: AgentParams) => [...agentKey(params), "runs"];
export const issueKey = ({ issue, ...params }: IssueParams) => [...agentKey(params), "issues", issue];

/** Read once per page load, since a membership rarely changes and every route needs it first. */
export const accessQuery = ({ orgId }: Org) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "access"],
    queryFn: () => getAccess({ data: { orgId } }),
    staleTime: "static",
  });

/** Read once per page load, like access. */
export const organizationsQuery = () =>
  queryOptions({
    queryKey: ["organizations"],
    queryFn: () => getOrganizations(),
    staleTime: "static",
  });

export const shellQuery = ({ orgId, tenant }: Org & { tenant: boolean }) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "shell", tenant],
    queryFn: async ({ client }) => {
      const [organizations, agents] = await Promise.all([
        client.query(organizationsQuery()),
        tenant ? client.query(agentsQuery({ orgId })).catch(() => []) : [],
      ]);
      return { organizations, agents };
    },
  });

export const agentsQuery = ({ orgId }: Org) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "agents"],
    queryFn: () => servicesClient(orgId).agents.list(),
  });

const repoOf = (agents: readonly { name: string; repo: string }[], agent: string) => {
  const found = agents.find(({ name }) => name === agent);
  if (found === undefined) {
    throw notFound();
  }

  return found.repo;
};

/** The Agent's repository, read from the Agents list the shell loaded rather than with a request. */
export async function agentRepo(client: QueryClient, { orgId, agent }: AgentParams) {
  // An Agent created since the list loaded is missing from it until the list is read again.
  const cached = await client.query({ ...agentsQuery({ orgId }), staleTime: "static" });
  const agents = cached.some(({ name }) => name === agent)
    ? cached
    : await client.query({ ...agentsQuery({ orgId }), staleTime: 0 });

  return repoOf(agents, agent);
}

export const useAgentRepo = ({ orgId, agent }: AgentParams) =>
  useSuspenseQuery({ ...agentsQuery({ orgId }), select: (agents) => repoOf(agents, agent) }).data;

export const agentRepoQuery = (params: AgentParams) =>
  queryOptions({
    queryKey: [...agentKey(params), "repo"],
    queryFn: async ({ client }) =>
      servicesClient(params.orgId).repos.get({ repo: await agentRepo(client, params) }),
  });

export const githubAppQuery = ({ orgId }: Org) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "github", "app"],
    queryFn: () => servicesClient(orgId).installations.getApp(),
    staleTime: "static",
  });

export const installationsQuery = ({ orgId }: Org) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "github", "installations"],
    // Without a GitHub App, git has no installation routes.
    queryFn: async () => {
      try {
        return await servicesClient(orgId).installations.list();
      } catch (caught) {
        if (caught instanceof GroundedError && caught.status === NOT_FOUND) {
          return [];
        }
        throw caught;
      }
    },
  });

export const installationReposQuery = ({ orgId, installation }: Org & { installation: number }) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "github", "installations", installation, "repos"],
    queryFn: () => servicesClient(orgId).installations.listRepos({ installation }),
  });

export const reposQuery = ({ orgId }: Org) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "repos"],
    queryFn: async () => {
      const repos = [];
      let page: Repository[] = [];
      for (let number = 1; number === 1 || page.length === REPOS_PAGE_SIZE; number++) {
        page = await servicesClient(orgId).repos.list({ page: number, per_page: REPOS_PAGE_SIZE });
        repos.push(...page);
      }

      return repos;
    },
  });

/** The commit at the head of `branch`, read as a ref so it's found however many branches there are. */
export async function branchHead(
  client: { git: Pick<GroundedClient["git"], "listMatchingRefs"> },
  repo: string,
  branch: string,
) {
  const refs = await client.git.listMatchingRefs({ repo, ref: `heads/${branch}` });
  const head = refs.find(({ ref }) => ref === `refs/heads/${branch}`);
  if (head === undefined) {
    throw new Error(`${repo} has no ${branch} branch`);
  }

  return head.object.sha;
}

/** The Agent's `repos.toml` at the head of its default branch, empty when there's none. */
export const manifestQuery = (params: AgentParams) =>
  queryOptions({
    queryKey: [...agentKey(params), "manifest"],
    queryFn: async ({ client }) => {
      const { name: repo, default_branch: branch } = await client.ensureQueryData(
        agentRepoQuery(params),
      );
      const api = servicesClient(params.orgId);
      const head = await branchHead(api, repo, branch);
      try {
        const file = await api.repos.getContent({
          repo,
          path: MANIFEST_PATH,
          ref: head,
        });
        return { repo, branch, head, toml: decodeContent(file, MANIFEST_PATH) };
      } catch (caught) {
        if (caught instanceof GroundedError && caught.status === NOT_FOUND) {
          return { repo, branch, head, toml: "" };
        }
        throw caught;
      }
    },
  });

export const keysQuery = (params: AgentParams) =>
  queryOptions({
    queryKey: [...agentKey(params), "keys"],
    queryFn: () => servicesClient(params.orgId).agents.listKeys({ agent: params.agent }),
  });

export const sessionsQuery = ({ orgId, ...options }: Org & ListSessionsOptions) =>
  queryOptions({
    queryKey: [...agentKey({ orgId, agent: options.agent }), "sessions", options],
    queryFn: () => servicesClient(orgId).agents.listSessions(options),
  });

export const annotationCountsQuery = (params: AgentParams) =>
  queryOptions({
    queryKey: [...agentKey(params), "annotation-counts"],
    queryFn: () => servicesClient(params.orgId).agents.annotationCounts({ agent: params.agent }),
  });

export const sessionQuery = ({
  after,
  ...params
}: AgentParams & { session: string; after: string | undefined }) =>
  queryOptions({
    queryKey: [...agentKey(params), "sessions", params.session, after],
    queryFn: async () => {
      const client = servicesClient(params.orgId);
      const { agent, session } = params;
      const [page, { annotations }] = await Promise.all([
        client.agents.getSession({ agent, session, after }),
        client.agents.listSessionAnnotations({ agent, session }),
      ]);
      return { page, annotations };
    },
  });

export const traceQuery = (params: AgentParams & { trace: string }) =>
  queryOptions({
    queryKey: [...agentKey(params), "traces", params.trace],
    queryFn: async () => {
      const client = servicesClient(params.orgId);
      const { agent, trace } = params;
      const [{ spans }, { annotations }] = await Promise.all([
        client.agents.getTrace({ agent, trace }),
        client.agents.listAnnotations({ agent, trace }),
      ]);
      return { spans, annotations };
    },
  });

export const evalsQuery = (params: AgentParams) =>
  queryOptions({
    queryKey: [...agentKey(params), "evals"],
    queryFn: async ({ client }) =>
      servicesClient(params.orgId).evals.list({ repo: await agentRepo(client, params) }),
  });

export const evalStatusesQuery = (params: AgentParams) =>
  queryOptions({
    queryKey: [...agentKey(params), "evals", "statuses"],
    queryFn: async ({ client }) =>
      servicesClient(params.orgId).evals.listStatuses({
        agent: params.agent,
        repo: await agentRepo(client, params),
      }),
    refetchInterval: pollWhile(({ run }: EvalStatuses) => run !== undefined && isRunPending(run)),
  });

export const evalQuery = (params: AgentParams & { eval: string }) =>
  queryOptions({
    queryKey: [...agentKey(params), "evals", params.eval],
    queryFn: async ({ client }) => {
      const evals = await client.query(evalsQuery(params));
      const task = evals.find((each) => each.id === params.eval);
      if (task === undefined) {
        throw notFound();
      }

      return task;
    },
  });

/** A run with its live steps, and its output when its job is in `JOB_OUTPUTS`. */
export const runQuery = (params: RunParams) =>
  queryOptions({
    queryKey: [...runsKey(params), params.run],
    queryFn: async () => {
      const client = servicesClient(params.orgId);
      const target = { agent: params.agent, run: params.run };
      const run = await client.jobs.getRun(target);
      return { run, output: await JOB_OUTPUTS.get(run.job)?.(client, target) };
    },
    refetchInterval: pollWhile(({ run, output }) =>
      output === undefined ? isRunLive(run) : isRunPending(run),
    ),
  });

/** A step's whole log so far, read on from the last whole UTF-8 character while the step runs. */
export const stepLogQuery = (params: RunParams & { step: JobRun["steps"][number] }) => {
  const { number, status } = params.step;
  const queryKey = [...runsKey(params), params.run, "steps", number, "log", status];
  return queryOptions({
    queryKey,
    queryFn: async ({ client }) => {
      const previous = client.getQueryData<StepLog>(queryKey) ?? { text: "", bytes: 0 };
      const chunk = await servicesClient(params.orgId).jobs.logs(
        { agent: params.agent, run: params.run },
        number,
        { offset: previous.bytes },
      );
      const whole = chunk.subarray(0, wholeCharactersLength(chunk));
      return {
        text: previous.text + new TextDecoder().decode(whole),
        bytes: previous.bytes + whole.length,
      };
    },
    refetchInterval: status === "in_progress" ? RUN_POLL_INTERVAL : false,
  });
};

type StepLog = { text: string; bytes: number };

/** How many of `bytes` precede a UTF-8 character the read cut short. */
function wholeCharactersLength(bytes: Uint8Array) {
  for (let index = bytes.length - 1; index >= Math.max(0, bytes.length - 4); index--) {
    const byte = bytes[index] ?? 0;
    if ((byte & 0xc0) !== 0x80) {
      const size = byte < 0x80 ? 1 : byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : 2;
      return index + size > bytes.length ? index : bytes.length;
    }
  }

  return bytes.length;
}

export const RUNS_PAGE_SIZE = 30;
export const SESSION_PAGE_SIZE = 50;

/** The Agent's jobs, each with its newest run. */
export const automationsQuery = (params: AgentParams) =>
  queryOptions({
    queryKey: [...agentKey(params), "jobs"],
    queryFn: async () => {
      const client = servicesClient(params.orgId);
      const jobs = await client.jobs.list({ agent: params.agent });
      return Promise.all(
        jobs.map(async (job) => {
          const [latest] = await client.jobs.listRuns({
            agent: params.agent,
            job: job.name,
            per_page: 1,
          });
          return { job, latest };
        }),
      );
    },
    refetchInterval: pollWhile((rows: { latest: JobRun | undefined }[]) =>
      rows.some(({ latest }) => latest !== undefined && isRunLive(latest)),
    ),
  });

export const jobQuery = (params: AgentParams & { job: string }) =>
  queryOptions({
    queryKey: [...agentKey(params), "jobs", params.job],
    queryFn: () => servicesClient(params.orgId).jobs.get({ agent: params.agent, job: params.job }),
  });

/** A page of the Agent's runs, newest first, of one job when `job` is set. */
export const runsQuery = ({
  orgId,
  agent,
  ...filters
}: AgentParams & { job?: string; page: number }) =>
  queryOptions({
    queryKey: [...runsKey({ orgId, agent }), "list", filters],
    queryFn: () =>
      servicesClient(orgId).jobs.listRuns({ agent, ...filters, per_page: RUNS_PAGE_SIZE }),
    refetchInterval: pollWhile((runs: JobRun[]) => runs.some(isRunLive)),
  });

/** Runs in progress, with their live steps, then queued runs. */
export const runningQuery = (params: AgentParams) =>
  queryOptions({
    queryKey: [...runsKey(params), "running"],
    queryFn: async () => {
      const client = servicesClient(params.orgId);
      const [inProgress, queued] = await Promise.all([
        client.jobs.listRuns({ agent: params.agent, status: "in_progress", per_page: 100 }),
        client.jobs.listRuns({ agent: params.agent, status: "queued", per_page: 100 }),
      ]);
      const live = await Promise.all(
        inProgress.map((run) => client.jobs.getRun({ agent: params.agent, run: run.id })),
      );
      return [...live, ...queued];
    },
    refetchInterval: pollWhile((runs: JobRun[]) => runs.length > 0),
  });

export const issuesQuery = (params: AgentParams) =>
  queryOptions({
    queryKey: [...agentKey(params), "issues"],
    queryFn: async ({ client }) =>
      servicesClient(params.orgId).issues.list({
        agent: params.agent,
        repo: await agentRepo(client, params),
      }),
    refetchInterval: pollWhile((issues: IssueSummary[]) => issues.some(isIssuePending)),
  });

export const issueQuery = (params: IssueParams) =>
  queryOptions({
    queryKey: issueKey(params),
    queryFn: async ({ client }) =>
      servicesClient(params.orgId).issues.get({
        agent: params.agent,
        repo: await agentRepo(client, params),
        id: params.issue,
      }),
    refetchInterval: pollWhile(isIssuePending),
  });

export const issueEventsQuery = (params: IssueParams) =>
  queryOptions({
    queryKey: [...issueKey(params), "events"],
    queryFn: async ({ client }) => {
      const repo = await agentRepo(client, params);
      const [events, names] = await Promise.all([
        servicesClient(params.orgId).issues.listEvents({ repo, id: params.issue }),
        getMemberNames({ data: { orgId: params.orgId } }),
      ]);
      return { events, names };
    },
  });

export const issueTracesQuery = ({
  after,
  ...params
}: IssueParams & { after: string | undefined; limit: number }) =>
  queryOptions({
    queryKey: [...issueKey(params), "traces", after],
    queryFn: async ({ client }) =>
      servicesClient(params.orgId).issues.listTraces({
        agent: params.agent,
        repo: await agentRepo(client, params),
        id: params.issue,
        after,
        limit: params.limit,
      }),
  });

/** The Evals the Issue's evals branch lists for it, or `null` before the branch exists. */
export const issueEvalsQuery = (params: IssueParams) =>
  queryOptions({
    queryKey: [...issueKey(params), "evals"],
    queryFn: async ({ client }) => {
      const repo = await agentRepo(client, params);
      try {
        const evals = await servicesClient(params.orgId).evals.list({
          repo,
          ref: getEvalsBranchById(params.issue),
        });
        return evals.filter(({ issues }) => issues.includes(params.issue));
      } catch (caught) {
        // Pebble opens the evals branch when it writes the Issue's first Evals.
        if (caught instanceof GroundedError && caught.status === NOT_FOUND) {
          return null;
        }
        throw caught;
      }
    },
  });

/** The `evals/` folder at the head of the Issue's evals branch, refetched only when invalidated so edits stay on the head they started from. */
export const debugEvalsQuery = (params: IssueParams) =>
  queryOptions({
    queryKey: [...issueKey(params), "debug-evals"],
    staleTime: Infinity,
    queryFn: async ({ client: queryClient }) => {
      const client = servicesClient(params.orgId);
      const repo = await agentRepo(queryClient, params);
      const [head] = await client.repos.listCommits({
        repo,
        sha: getEvalsBranchById(params.issue),
        per_page: 1,
      });
      if (head === undefined) {
        throw new Error(`Issue ${params.issue} has no evals branch`);
      }

      const [tree, { files }] = await Promise.all([
        client.repos.listContents({ repo, path: EVALS_DIR, ref: head.sha }),
        client.repos.compareCommits({ repo, basehead: `main...${head.sha}` }),
      ]);
      const changes = files.filter(({ filename }) => filename.startsWith(`${EVALS_DIR}/`));
      return { sha: head.sha, tree, changes };
    },
  });

export const baselineRunQuery = (params: IssueParams) =>
  queryOptions({
    queryKey: [...issueKey(params), "baseline-run"],
    queryFn: async () =>
      (await servicesClient(params.orgId).issues.getBaselineRun({
        agent: params.agent,
        id: params.issue,
      })) ?? null,
    refetchInterval: RUN_POLL_INTERVAL,
  });

export const candidatesQuery = (params: IssueParams) =>
  queryOptions({
    queryKey: [...issueKey(params), "candidates"],
    queryFn: async ({ client }) =>
      servicesClient(params.orgId).issues.listCandidates({
        agent: params.agent,
        repo: await agentRepo(client, params),
        id: params.issue,
      }),
    refetchInterval: pollWhile((candidates: CandidateSummary[]) =>
      candidates.some(isCandidatePending),
    ),
  });

export const candidateQuery = (params: IssueParams & { candidate: string }) =>
  queryOptions({
    queryKey: [...issueKey(params), "candidates", params.candidate],
    queryFn: async ({ client }) => {
      const candidate = await servicesClient(params.orgId).issues.getCandidate({
        agent: params.agent,
        repo: await agentRepo(client, params),
        id: params.issue,
        candidate: params.candidate,
      });
      if (candidate === undefined) {
        throw notFound();
      }

      return candidate;
    },
    refetchInterval: pollWhile(isCandidatePending),
  });

export const canvasQuery = (params: IssueParams) =>
  queryOptions({
    queryKey: [...issueKey(params), "canvas"],
    staleTime: Infinity,
    queryFn: async ({ client: queryClient }) => {
      const client = servicesClient(params.orgId);
      const repo = await agentRepo(queryClient, params);
      const { head_oid, body } = await client.issues.get({
        agent: params.agent,
        repo,
        id: params.issue,
      });
      try {
        const notes = await client.repos.listContents({
          repo,
          path: getNotesDirById(params.issue),
          ref: head_oid,
        });
        return { head_oid, body, notes };
      } catch (caught) {
        if (caught instanceof GroundedError && caught.status === NOT_FOUND) {
          return { head_oid, body, notes: [] };
        }
        throw caught;
      }
    },
  });

/** An agent repository's whole tree at a commit, which never changes. */
export const treeQuery = (params: AgentParams & { ref: string }) =>
  queryOptions({
    queryKey: [...agentKey(params), "tree", params.ref],
    staleTime: Infinity,
    queryFn: async ({ client }) =>
      servicesClient(params.orgId).repos.listContents({
        repo: await agentRepo(client, params),
        ref: params.ref,
      }),
  });

const THREAD_PAGE_SIZE = 20;
export const threadsKey = ({ orgId }: Org) => [...orgKey(orgId), "pebble", "threads"];

/** The caller's Pebble threads, most recently used first, a page at a time. */
export const threadsQuery = ({ orgId }: Org) =>
  infiniteQueryOptions({
    queryKey: threadsKey({ orgId }),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      servicesClient(orgId).pebble.threads.list({ limit: THREAD_PAGE_SIZE, after: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: ({ threads, has_more }) => (has_more ? threads.at(-1)?.id : undefined),
  });

export const threadQuery = ({ orgId, thread }: Org & { thread: string }) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "pebble", "thread", thread],
    queryFn: async () => {
      try {
        return await servicesClient(orgId).pebble.threads.get(thread);
      } catch (caught) {
        if (caught instanceof GroundedError && caught.status === NOT_FOUND) {
          throw notFound();
        }
        throw caught;
      }
    },
  });

export const modelsQuery = ({ orgId }: Org) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "models"],
    queryFn: () => servicesClient(orgId).settings.models(),
  });

export const usageQuery = ({ orgId, ...range }: Org & UsageRange) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "usage", range],
    queryFn: () => servicesClient(orgId).settings.usage(range),
  });

export const sandboxUsageQuery = ({ orgId }: Org) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "sandbox-usage"],
    queryFn: () => servicesClient(orgId).sandboxes.usage(),
    refetchInterval: SANDBOX_USAGE_POLL_INTERVAL,
  });

export const memberNamesQuery = ({ orgId }: Org) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "member-names"],
    queryFn: () => getMemberNames({ data: { orgId } }),
  });

export const deploymentQuery = ({ orgId, ...range }: Org & UsageRange) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "deployment", range],
    queryFn: async () => {
      const client = servicesClient(orgId);
      const [models, usage, names] = await Promise.all([
        client.deployment.models(),
        client.deployment.usage(range),
        getOrganizationNames({ data: { orgId } }),
      ]);
      return { models, usage, names };
    },
  });

export const membersQuery = ({ orgId }: Org) =>
  queryOptions({
    queryKey: [...orgKey(orgId), "members"],
    queryFn: () => listMembers({ data: { orgId } }),
  });
