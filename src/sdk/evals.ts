import { z } from "zod";

import type { Agents, ListedTrace } from "./agents.ts";
import type { JobRun, Jobs, RunTarget } from "./jobs.ts";
import { type Repos, decodeContent } from "./repos.ts";

/** An Agent repo's `evals/registry.json`, which its eval framework's adapter writes on each commit. */
export const evalRegistrySchema = z.object({
  format: z.literal(1),
  evals: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      path: z.string().min(1),
      issues: z.array(z.string()),
      prompt: z.string(),
      digest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
      criteria: z.array(
        z.object({
          name: z.string().min(1),
          description: z.string(),
          kind: z.enum(["code", "llm"]),
          scale: z
            .discriminatedUnion("type", [
              z.object({ type: z.literal("binary") }),
              z.object({ type: z.literal("numeric"), min: z.number(), max: z.number() }),
              z.object({ type: z.literal("categorical"), levels: z.array(z.string()).min(2) }),
            ])
            .optional(),
        }),
      ),
    }),
  ),
});

const GRADE_ANNOTATION_PATTERN = /^grounded\/grade\/(.+)$/;

/** The labels of a pass-or-fail Grade, as `grade.json` allows them. */
export const PASS_LABEL = "pass";
export const FAIL_LABEL = "fail";

/** The criterion a `grounded/grade/<criterion>` annotation grades, like `tone/rude`. */
export const getGradeCriterion = ({ name }: { name: string }) =>
  GRADE_ANNOTATION_PATTERN.exec(name)?.[1];

export type EvalRegistry = z.output<typeof evalRegistrySchema>;

export type RegisteredEval = EvalRegistry["evals"][number];

export type EvalResult = {
  /** The Eval's registry ID, from its trials' `grounded.task.name`. */
  eval: string;
  /** Whether every trial has an annotation labeled `pass` and none labeled `fail`. */
  passed: boolean;
  trials: ListedTrace[];
};

/** A `run-evals` run with each Eval it ran, failing ones first. */
export type EvalRun = { run: JobRun; results: EvalResult[] };

/** An Eval's standing on the default branch. */
export type EvalStatus = {
  eval: string;
  /** Whether it passed in the newest full run with results, undefined when that run didn't run it. */
  passed: boolean | undefined;
  /** When the newest full run it passed in started, undefined when none of the runs looked at passed it. */
  passed_at: string | undefined;
};

/** The default branch's newest full `run-evals` run, which may still be running, and each registered Eval's standing. */
export type EvalStatuses = { run: JobRun | undefined; evals: EvalStatus[] };

export const EVALS_DIR = "evals";
export const RUN_EVALS_JOB = "grounded/run-evals";
export const EVAL_REGISTRY_PATH = `${EVALS_DIR}/registry.json`;
const TRIAL_PAGE_SIZE = 100;
const STATUS_RUN_PAGE_SIZE = 10;
// About a month of nightly runs, as long as trials are kept.
const STATUS_RUN_LIMIT = 30;

/** Whether a `run-evals` run published results for every Eval, since a dry run or a run over some tasks can't serve as a baseline or ship a Candidate. */
export const isFullEvalRun = ({ dry_run, inputs }: JobRun) =>
  !dry_run && (!Array.isArray(inputs.tasks) || inputs.tasks.length === 0);

const isPassing = ({ annotations }: ListedTrace) =>
  annotations.some(({ label }) => label === PASS_LABEL) &&
  !annotations.some(({ label }) => label === FAIL_LABEL);

/** An Agent's Evals, read from `evals/registry.json` at a ref (the repo's default branch when omitted). */
export class Evals {
  constructor(
    private readonly repos: Repos,
    private readonly agents: Agents,
    private readonly jobs: Jobs,
  ) {}

  async list({ repo, ref }: { repo: string; ref?: string | undefined }): Promise<RegisteredEval[]> {
    const file = await this.repos.getContent({ repo, path: EVAL_REGISTRY_PATH, ref });
    return evalRegistrySchema.parse(JSON.parse(decodeContent(file, EVAL_REGISTRY_PATH))).evals;
  }

  async getRun(target: RunTarget): Promise<EvalRun> {
    const [run, trials] = await Promise.all([
      this.jobs.getRun(target),
      this.listTrials(target.agent, target.run),
    ]);
    const byEval = new Map<string, ListedTrace[]>();
    for (const trial of trials) {
      byEval.set(trial.task_name, [...(byEval.get(trial.task_name) ?? []), trial]);
    }
    const results = [...byEval].map(([id, ranTrials]) => ({
      eval: id,
      passed: ranTrials.every(isPassing),
      trials: ranTrials,
    }));

    return {
      run,
      results: results.sort(
        (a, b) => Number(a.passed) - Number(b.passed) || a.eval.localeCompare(b.eval),
      ),
    };
  }

  /** Each Eval in the default branch's registry with its result in the branch's newest full run and when it last passed, looking back over its newest `run-evals` runs until every Eval has passed. */
  async listStatuses({ agent, repo }: { agent: string; repo: string }): Promise<EvalStatuses> {
    const [{ default_branch }, registered] = await Promise.all([
      this.repos.get({ repo }),
      this.list({ repo }),
    ]);
    let newest: JobRun | undefined;
    let latest: Map<string, boolean> | undefined;
    const passedAt = new Map<string, string>();
    const resolved = () => registered.every(({ id }) => passedAt.has(id));
    let examined = 0;
    for (
      let page = 1, more = true;
      more && examined < STATUS_RUN_LIMIT && (page === 1 || !resolved());
      page++
    ) {
      const runs = await this.jobs.listRuns({
        agent,
        job: RUN_EVALS_JOB,
        branch: default_branch,
        page,
        per_page: STATUS_RUN_PAGE_SIZE,
      });
      const full = runs.filter(isFullEvalRun).slice(0, STATUS_RUN_LIMIT - examined);
      examined += full.length;
      newest ??= full[0];
      const read = await Promise.all(
        full.flatMap((run) =>
          run.status === "completed" ? [this.getRun({ agent, run: run.id })] : [],
        ),
      );
      for (const { run, results } of read) {
        if (latest === undefined && results.length > 0) {
          latest = new Map(results.map((result) => [result.eval, result.passed]));
        }
        for (const result of results) {
          if (result.passed && !passedAt.has(result.eval)) {
            passedAt.set(result.eval, run.created_at);
          }
        }
      }
      more = runs.length === STATUS_RUN_PAGE_SIZE;
    }

    return {
      run: newest,
      evals: registered.map(({ id }) => ({
        eval: id,
        passed: latest?.get(id),
        passed_at: passedAt.get(id),
      })),
    };
  }

  private async listTrials(agent: string, run: string, after?: string): Promise<ListedTrace[]> {
    const { traces, has_more } = await this.agents.listTraces({
      agent,
      trial: true,
      attribute: [`grounded.job_run.id:${run}`],
      limit: TRIAL_PAGE_SIZE,
      after,
    });
    const next = has_more ? traces.at(-1)?.trace_id : undefined;
    return next === undefined ? traces : [...traces, ...(await this.listTrials(agent, run, next))];
  }
}
