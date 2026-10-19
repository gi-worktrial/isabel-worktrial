import type { JobRun } from "#src/sdk/index";

import type { File, MemoryGit } from "./git.ts";
import {
  batches,
  clockOf,
  counted,
  evalSubject,
  evalSummary,
  passedEval,
  ranEvals,
  stepAt,
} from "./play.ts";
import { TASKS } from "./registry.ts";
import type { TrialRow } from "./trials.ts";

/** How many trials a run-evals step plays side by side, each in its own sandbox. */
export const RUN_TRIALS = 6;

export type Recorded = { reward: number; cost_usd: number; trace_id: string };
/** outcomes.json keyed by the `agent/` tree sha then the `evals/tasks/<t>` tree sha, so tree-equal edits hit a recording. */
export type Outcomes = Record<string, Record<string, Recorded>>;
// result.json's counts by noun, with the PRs a run opened under `pulls`
type Counts = Record<string, number | number[]>;
/**
 * A finished recorded run with its log and result, less the steps its job.toml gives it; `annotated` says the evaluations
 * it exported sit in its own OTLP logs file.
 */
export type SeedRun = Omit<JobRun, "steps"> & {
  trials?:
    | Array<{
        trial: string;
        task: string;
        trace_id: string;
        started_at: string;
        finished_at: string;
        cost_usd: number;
      }>
    | undefined;
  logs: string[];
  result?: Counts | undefined;
  annotated?: true | undefined;
  annotation_kind?: "code" | "llm" | undefined;
};
// played back only while the job's code still matches
// a job that writes no result.json has no result
export type Recipe = { duration_ms: number; logs: string[]; result?: Counts | undefined };

export type Submitted = {
  run: JobRun;
  created_ms: number;
  cancelled_ms?: number | undefined;
  // run-evals only
  tasks?: string[] | undefined;
  // null when the job's code no longer matches the recording
  recipe?: Recipe | null | undefined;
};

export type Played = {
  run: JobRun;
  trials: TrialRow[];
  logs: string[];
  result?: Counts | undefined;
};

type RunStep = JobRun["steps"][number];

/**
 * Each step as platform reports it once a run started at `started`: setup takes no time, the first run step plays
 * the recording until `ended`, a later step finishes with it, and one the run never reached ends skipped.
 */
export function runSteps(
  names: readonly string[],
  started: string | null,
  ended: { at: string; conclusion: NonNullable<JobRun["conclusion"]> } | null,
): RunStep[] {
  return names.map((name, number): RunStep => {
    // the demo plays no Pi session, so a prompt step has no entry to point at
    const step = { number, name, started_at: null, completed_at: null, prompt_entry: null };
    const queued = { ...step, status: "queued", conclusion: null } as const;
    const done = (conclusion: RunStep["conclusion"], from: string | null, to: string | null) =>
      ({ ...step, status: "completed", conclusion, started_at: from, completed_at: to }) as const;
    if (started === null) {
      return ended === null ? queued : done("skipped", null, null);
    }
    if (number === 0) {
      return done("success", started, started);
    }
    if (ended === null) {
      return number === 1
        ? { ...step, status: "in_progress", conclusion: null, started_at: started }
        : queued;
    }
    if (number === 1) {
      return done(ended.conclusion, started, ended.at);
    }
    return ended.conclusion === "success"
      ? done("success", ended.at, ended.at)
      : done("skipped", null, null);
  });
}

/** A queued run before replay derives its lifecycle fields, with its job's step names copied in. */
export function queuedRun(
  fields: Pick<
    JobRun,
    | "id"
    | "agent"
    | "job"
    | "trigger"
    | "ref"
    | "sha"
    | "definition_commit"
    | "inputs"
    | "concurrency_group"
    | "created_by"
    | "created_at"
  >,
  steps: readonly string[],
): JobRun {
  return {
    ...fields,
    dry_run: false,
    status: "queued",
    conclusion: null,
    phase: "queued",
    steps: runSteps(steps, null, null),
    exit_code: null,
    priority: { workflow_dispatch: 2, push: 1, pull_request: 1, schedule: 0 }[fields.trigger],
    replaced_by: null,
    parent_run_id: null,
    error: null,
    cancel_requested_at: null,
    started_at: null,
    completed_at: null,
    cleaned_at: null,
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

function played(
  submitted: Submitted,
  now: number,
  [started, last]: readonly [number, number],
  error: string | null,
): JobRun {
  const stopped = submitted.cancelled_ms ?? Number.POSITIVE_INFINITY;
  const base = submitted.run;
  const names = base.steps.map((step) => step.name);
  if (stopped <= now && stopped < last) {
    return {
      ...base,
      status: "completed",
      conclusion: "cancelled",
      phase: "done",
      steps: runSteps(names, stopped >= started ? iso(started) : null, {
        at: iso(stopped),
        conclusion: "cancelled",
      }),
      exit_code: null,
      error: null,
      cancel_requested_at: stopped >= started ? iso(stopped) : null,
      started_at: stopped >= started ? iso(started) : null,
      completed_at: iso(stopped),
      cleaned_at: iso(stopped),
    };
  }
  if (now < started) {
    return base;
  }
  if (now < last) {
    return {
      ...base,
      status: "in_progress",
      phase: "running",
      steps: runSteps(names, iso(started), null),
      started_at: iso(started),
    };
  }
  const conclusion = error === null ? "success" : "failure";
  return {
    ...base,
    status: "completed",
    conclusion,
    phase: "done",
    steps: runSteps(names, iso(started), { at: iso(last), conclusion }),
    exit_code: error === null ? 0 : 1,
    error,
    started_at: iso(started),
    completed_at: iso(last),
    cleaned_at: iso(last),
  };
}

// queued a step, then `RUN_TRIALS` trials a step side by side, each as long as its recording
export function evalRunAt(
  submitted: Submitted,
  now: number,
  stepMs: number,
  // "Candidate A" or "Baseline"
  who: string,
  outcome: (task: string) => Recorded | undefined,
  took: (task: string) => number | undefined,
): Played {
  const tasks = submitted.tasks ?? [];
  const started = submitted.created_ms + stepMs;
  const known = tasks.flatMap((task) => took(task) ?? []).toSorted((left, right) => left - right);
  const ms = (task: string) => took(task) ?? known[Math.floor(known.length / 2)] ?? stepMs;
  const longest = Math.max(0, ...tasks.map(ms));
  const clock = Math.min(now, submitted.cancelled_ms ?? Number.POSITIVE_INFINITY);
  const groups = batches(tasks, RUN_TRIALS);
  const trials = groups.flatMap((group, index): TrialRow[] => {
    // each step's trials show as the replay reaches them
    const end = started + (index + 1) * stepMs;
    if (clock < end) {
      return [];
    }
    return group.map((task) => {
      const recorded = outcome(task);
      return {
        trial: `${task}__${submitted.run.id.slice(0, 7)}`,
        task,
        recorded: recorded?.trace_id ?? null,
        started_at: iso(started),
        finished_at: iso(started + ms(task)),
        cost_usd: recorded?.cost_usd ?? null,
      };
    });
  });
  const last = started + groups.length * stepMs;
  const missing = trials.some((trial) => trial.recorded === null);
  const passed = trials.filter((trial) => passedEval(outcome(trial.task))).length;
  const playing = played(
    submitted,
    now,
    [started, last],
    missing ? "No recorded outcome for this revision" : null,
  );
  const ended = playing.status === "completed" && playing.conclusion !== "cancelled";
  const finished = iso(started + longest);
  const run = ended
    ? {
        ...playing,
        steps: runSteps(
          playing.steps.map((step) => step.name),
          playing.started_at,
          { at: finished, conclusion: playing.conclusion ?? "success" },
        ),
        completed_at: finished,
        cleaned_at: finished,
      }
    : playing;
  const tested = evalSubject(who);
  const elapsed = clockOf(ended ? longest : Math.max(0, Math.min(clock, last) - started));
  const failed = trials.length - passed;
  const logs = [
    ...(run.conclusion === "success" ? [evalSummary(passed, tasks.length)] : []),
    ended
      ? `${elapsed} ${ranEvals(trials.length, who, true)}`
      : `${elapsed} Running Evals on ${tested}, ${trials.length} of ${tasks.length}`,
    ...(failed > 0 && !missing ? [`${elapsed} ${counted(failed, "Eval", true)} failed`] : []),
    ...(missing ? ["No recorded outcome for this revision"] : []),
  ];
  return { run, trials, logs };
}

const DOING: Record<string, string> = {
  Graded: "Grading",
  Ran: "Running",
  Checked: "Checking",
  Read: "Reading",
};
// a job queues half a second, and one whose code no longer matches a recording fails a second after it starts
const QUEUED_MS = 500;
const UNRECORDED_MS = 1500;

// fails when the job has no recording
export function jobRunAt(submitted: Submitted, now: number): Played {
  const recipe = submitted.recipe ?? null;
  const duration = recipe?.duration_ms ?? UNRECORDED_MS;
  const window = [submitted.created_ms + QUEUED_MS, submitted.created_ms + duration] as const;
  const missing = "No recorded result for this Automation's edited code";
  const run = played(submitted, now, window, recipe === null ? missing : null);
  if (recipe === null) {
    const logs = run.conclusion === "failure" ? [missing] : [];
    return { run, trials: [], logs };
  }
  const [, ...steps] = recipe.logs;
  const elapsed = Math.min(now, submitted.cancelled_ms ?? now) - window[0];
  const done = steps.filter((line) => stepAt(line) <= elapsed);
  // the step under way counts its progress, as in "0:02 Checking Issues, 3 of 9"
  const next = run.status === "in_progress" ? steps[done.length] : undefined;
  const [, verb = "", many = "", noun = ""] =
    /^\S+ (Graded|Ran|Checked|Read) ([\d,]+)\s([^,]+)/u.exec(next ?? "") ?? [];
  const total = Number(many.replaceAll(",", ""));
  const from = stepAt(done.at(-1) ?? "");
  const share = (elapsed - from) / Math.max(1, stepAt(next ?? "") - from);
  const progress =
    verb === ""
      ? []
      : [
          `${clockOf(elapsed)} ${DOING[verb] ?? verb} ${noun}, ${Math.floor(total * share).toLocaleString("en-US")} of ${many}`,
        ];
  const logs =
    run.conclusion === "success"
      ? recipe.logs
      : run.status === "queued"
        ? []
        : [...done, ...progress];
  return {
    run,
    trials: [],
    logs,
    ...(run.conclusion === "success" ? { result: recipe.result } : {}),
  };
}

/**
 * The recording a run of a task at a commit replays. A hand edit replays the recorded Agent closest to it, the fewest
 * changed lines and then the nearest ancestor, so a Candidate branched in Debug replays the one it came from.
 */
export function recordingsOf(git: MemoryGit, outcomes: Outcomes) {
  const agentOf = (commit: string) => git.entryAt(commit, "agent")?.sha;
  const agentParent = (commit: string) => {
    const [first, second] = git.commit(commit).parents;
    if (first === undefined || second === undefined) {
      return first;
    }
    const base = agentOf(git.mergeBase(first, second));
    return agentOf(first) === base && agentOf(second) !== base ? second : first;
  };
  const found = new Map<string, Recorded | undefined>();
  const at = (commit: string, task: string) => {
    const key = `${commit}/${task}`;
    if (found.has(key)) {
      return found.get(key);
    }
    const tree = git.entryAt(commit, `${TASKS}/${task}`)?.sha;
    const lineage: string[] = [];
    for (let from: string | undefined = commit; from !== undefined; from = agentParent(from)) {
      lineage.push(agentOf(from) ?? "");
    }
    const recorded = Object.keys(outcomes).filter(
      (version) => tree !== undefined && outcomes[version]?.[tree] !== undefined,
    );
    const own = agentOf(commit);
    const files = own === undefined ? undefined : git.treeFiles(own);
    const distance = (version: string) => {
      if (version === own) {
        return 0;
      }
      // a recording made from a scripted edit has no tree in the repo, so only its exact Agent replays it
      const other = files === undefined || !git.has(version) ? undefined : git.treeFiles(version);
      if (files === undefined || other === undefined) {
        return Number.POSITIVE_INFINITY;
      }
      // lines in one version and not the other, over the files whose content differs
      const lines = (file: File | undefined) =>
        new Set(file === undefined ? [] : git.text(file.sha).split("\n"));
      return [...new Set([...files.keys(), ...other.keys()])]
        .filter((path) => files.get(path)?.sha !== other.get(path)?.sha)
        .reduce((sum, path) => {
          const [mine, theirs] = [lines(files.get(path)), lines(other.get(path))];
          return (
            sum +
            [...mine].filter((line) => !theirs.has(line)).length +
            [...theirs].filter((line) => !mine.has(line)).length
          );
        }, 0);
    };
    const rank = (version: string) => {
      const index = lineage.indexOf(version);
      return index === -1 ? lineage.length : index;
    };
    const [closest] = recorded
      .map((version) => ({ version, distance: distance(version), rank: rank(version) }))
      .filter((entry) => entry.distance !== Number.POSITIVE_INFINITY || entry.rank < lineage.length)
      .toSorted((left, right) => left.distance - right.distance || left.rank - right.rank);
    const result = closest === undefined ? undefined : outcomes[closest.version]?.[tree ?? ""];
    found.set(key, result);
    return result;
  };
  return { at, clear: () => found.clear() };
}
