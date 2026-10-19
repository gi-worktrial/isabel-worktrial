// what platform's run and Eval Runs pages add: trial Compare above their trials, its picks kept in the page's URL, and
// what Pebble reads about a run
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { evalQuery } from "#/queries";
import { formatTimestamp } from "#/ui/format";
import { type TrialOption, TrialCompare, trialLabels } from "#src/features/traces/trial-compare";
import type { EvalRun, JobRun, SessionSummary } from "#src/sdk/index";

const RUN = "/$orgId/agents/$agent/runs/$run";
const EVAL_RUNS = "/$orgId/agents/$agent/evals/$eval/runs";
const PICK = { replace: true, resetScroll: false } as const;

type Trial = Omit<TrialOption, "label"> & { name: string };

// Compare's options, each trial named, with a number where several share a name
function toOptions(trials: readonly Trial[]): TrialOption[] {
  const labels = trialLabels(trials.map(({ name }) => name));
  return trials.map(({ name, ...trial }, index) => ({ ...trial, label: labels[index] ?? name }));
}

/** A run's trials to compare, each named by its Eval. */
export function RunTrials({
  params,
  results,
}: {
  params: { orgId: string; agent: string; run: string };
  results: EvalRun["results"];
}) {
  const { trials: picked } = useSearch({ from: RUN });
  const navigate = useNavigate({ from: RUN });
  const options = toOptions(
    results.flatMap(({ eval: id, trials }) =>
      trials.map((trial) => ({
        session: trial.session_id,
        eval: id,
        name: id,
        annotations: trial.annotations,
      })),
    ),
  );
  return options.length === 0 ? null : (
    <TrialCompare
      params={params}
      options={options}
      picked={picked}
      onPick={(next) =>
        void navigate({ search: (previous) => ({ ...previous, trials: next }), ...PICK })
      }
      askPrompt={({ label }) => `Why did ${label} fail in run ${params.run.slice(0, 8)}? `}
    />
  );
}

/** An Eval's trials to compare, each a run of it named by its time. */
export function EvalRunTrials({
  params,
  sessions,
}: {
  params: { orgId: string; agent: string; eval: string };
  sessions: readonly SessionSummary[];
}) {
  const { trials: picked } = useSearch({ from: EVAL_RUNS });
  const navigate = useNavigate({ from: EVAL_RUNS });
  const task = useSuspenseQuery(evalQuery(params)).data;
  const options = toOptions(
    sessions.map((session) => ({
      session: session.session_id,
      eval: params.eval,
      name: formatTimestamp(session.started_at),
      annotations: session.annotations,
    })),
  );
  return options.length === 0 ? null : (
    <TrialCompare
      params={params}
      options={options}
      picked={picked}
      onPick={(next) =>
        void navigate({ search: (previous) => ({ ...previous, trials: next }), ...PICK })
      }
      askPrompt={({ label }) => `Why did ${task.title} fail in its run at ${label}? `}
    />
  );
}

const RUN_PROMPTS = ["Why did these Evals fail?", "Which failure should I look at first?"];

/** What Pebble reads about a run's page, and its suggested prompts. */
export function runPebblePage(
  run: JobRun,
  output: EvalRun["results"] | undefined,
): [string, string[]] {
  const failing = output?.filter(({ passed }) => !passed).map((result) => result.eval) ?? [];
  const evals =
    output === undefined
      ? ""
      : ` It ran ${output.length} Evals${failing.length > 0 ? `, failing ${failing.join(", ")}` : ", all passing"}.`;
  return [
    `The engineer is viewing run ${run.id} of ${run.job} on ${run.ref} at commit ${run.sha} (${run.status}${run.conclusion === null ? "" : `, ${run.conclusion}`}).${evals}`,
    RUN_PROMPTS,
  ];
}
