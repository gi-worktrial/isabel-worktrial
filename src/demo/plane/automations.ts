import type { JobRun } from "#src/sdk/index";

import type { MemoryGit } from "./git.ts";
import {
  concurrencyGroup,
  DEFAULT_CONCURRENCY_GROUP,
  decodeJobDefinition,
  runStepNames,
} from "./job-definition.ts";
import { jobFolder, jobToml } from "./paths.ts";
import { clockOf, stepAt } from "./play.ts";
import { queuedRun, type Recipe, type Submitted } from "./runs.ts";

// a live run still has half an hour to go when the demo opens
const LIVE_LEFT_MS = 30 * 60_000;

/** A job's replay and its recorded commit, with `live` for a run already under way when the demo opens. */
export type RecordedJob = Recipe & {
  source_commit: string;
  live?: (Pick<JobRun, "id" | "trigger" | "created_by"> & { elapsed_ms: number }) | undefined;
};

/** The runs under way when the demo opens, each `elapsed_ms` into its recording on main. */
export function liveRuns(
  jobs: Readonly<Record<string, RecordedJob>>,
  agent: string,
  main: () => string,
  opened: number,
  // the concurrency group and step names its job.toml on main gives a run
  queueOf = (job: string, trigger: JobRun["trigger"], ref: string) => ({
    group: concurrencyGroup(DEFAULT_CONCURRENCY_GROUP, { job, trigger, ref, inputs: {} }),
    steps: runStepNames([{ name: job }]),
  }),
): Submitted[] {
  return Object.entries(jobs).flatMap(([job, { live, duration_ms, logs, result }]) => {
    if (live === undefined) {
      return [];
    }
    // the rest stretches over that half hour while the part already run keeps its real pace
    const stretch = Math.max(1, LIVE_LEFT_MS / (duration_ms - live.elapsed_ms));
    const later = (ms: number) =>
      ms <= live.elapsed_ms ? ms : live.elapsed_ms + (ms - live.elapsed_ms) * stretch;
    const created = opened - live.elapsed_ms;
    const [summary = "", ...steps] = logs;
    const stretched = steps.map((line) =>
      line.replace(/^\d+:\d\d/u, () => clockOf(later(stepAt(line)))),
    );
    const queue = queueOf(job, live.trigger, "main");
    return [
      {
        run: queuedRun(
          {
            id: live.id,
            agent,
            job,
            trigger: live.trigger,
            ref: "main",
            sha: main(),
            definition_commit: main(),
            inputs: {},
            concurrency_group: queue.group,
            created_by: live.created_by,
            created_at: new Date(created).toISOString(),
          },
          queue.steps,
        ),
        created_ms: created,
        recipe: { duration_ms: later(duration_ms), logs: [summary, ...stretched], result },
      },
    ];
  });
}

// what shows in Automations and when it runs may change, but anything else is the code the recording ran
function executable(text: string) {
  const { name: _name, on: _on, ...config } = decodeJobDefinition(text);
  return JSON.stringify(config);
}

// null once the job's code or configuration differs from the recording
export function replay(
  recorded: RecordedJob | undefined,
  git: MemoryGit,
  job: string,
  commit: string,
): Recipe | null {
  if (recorded === undefined) {
    return null;
  }
  const folder = jobFolder(job);
  const filesAt = (sha: string) => [...git.files(sha)].filter(([path]) => path.startsWith(folder));
  const now = filesAt(commit);
  const then = new Map(filesAt(recorded.source_commit));
  const manifest = jobToml(job);
  const same =
    now.length === then.size &&
    now.every(([path, file]) => {
      const old = then.get(path);
      if (old === undefined) {
        return false;
      }
      return path === manifest
        ? executable(git.text(file.sha)) === executable(git.text(old.sha))
        : old.sha === file.sha && old.mode === file.mode;
    });
  return same
    ? { duration_ms: recorded.duration_ms, logs: recorded.logs, result: recorded.result }
    : null;
}
