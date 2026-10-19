// reads platform's queries.ts doesn't have: the @mention Trace search, a span's Grades, a Candidate's runs, Grades and Compare
import { queryOptions } from "@tanstack/react-query";

import {
  agentKey,
  agentRepo,
  isRunPending,
  issueKey,
  RUN_POLL_INTERVAL,
  RUNS_PAGE_SIZE,
  runsKey,
} from "#/queries";
import { clientFor } from "#src/queries/client";
import { RUN_EVALS_JOB, isFullEvalRun } from "#src/sdk/evals";
import type { JobRun } from "#src/sdk/jobs";
import { getTestMergeRef } from "#src/sdk/pulls";

type AgentParams = { orgId: string; agent: string };
type IssueParams = AgentParams & { issue: string };

const TRACE_SEARCH_LIMIT = 20;

/** Production Traces whose message or ID matches `q`, as @mentions list them. */
export const traceSearchQuery = ({ orgId, agent, q }: AgentParams & { q: string }) =>
  queryOptions({
    queryKey: [...agentKey({ orgId, agent }), "trace-search", { q }],
    queryFn: () =>
      clientFor(orgId).agents.listTraces({ agent, trial: false, limit: TRACE_SEARCH_LIMIT, q }),
  });

/** A Candidate's full Eval runs on its test merge, newest first, keyed by its newest so a new run rereads them. */
export const candidateRunsQuery = (params: IssueParams & { pull: number; newest: string }) =>
  queryOptions({
    queryKey: [...issueKey(params), "candidate-runs", params.pull, params.newest],
    queryFn: async () => {
      const runs = await clientFor(params.orgId).jobs.listRuns({
        agent: params.agent,
        job: RUN_EVALS_JOB,
        branch: getTestMergeRef(params.pull),
        per_page: RUNS_PAGE_SIZE,
      });
      return runs.filter(isFullEvalRun);
    },
  });

/** A run's Eval results with the registry at the commit it ran on, as a Candidate's Grades and Compare read them. */
export const runEvalsQuery = (params: AgentParams & { run: string; sha: string }) =>
  queryOptions({
    queryKey: [...runsKey(params), params.run, "evals"],
    queryFn: async ({ client }) => {
      const product = clientFor(params.orgId);
      const [evals, { run, results }] = await Promise.all([
        product.evals.list({ repo: await agentRepo(client, params), ref: params.sha }),
        product.evals.getRun({ agent: params.agent, run: params.run }),
      ]);
      return { run, evals, results };
    },
    refetchInterval: ({ state }: { state: { data: { run: JobRun } | undefined } }) =>
      state.data !== undefined && isRunPending(state.data.run) ? RUN_POLL_INTERVAL : false,
  });

/** What differs between two commits (`base...head`, from their merge base), as Compare and diff mode read it. */
export const comparisonQuery = (params: AgentParams & { basehead: string }) =>
  queryOptions({
    queryKey: [...agentKey(params), "compare", params.basehead],
    queryFn: async ({ client }) =>
      clientFor(params.orgId).repos.compareCommits({
        repo: await agentRepo(client, params),
        basehead: params.basehead,
      }),
  });
