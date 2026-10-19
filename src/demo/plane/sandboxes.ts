import { type JobRun, RUN_EVALS_JOB, type SandboxUsage } from "#src/sdk/index";

import { RUN_TRIALS } from "./runs.ts";
import type { ThreadRecord } from "./threads.ts";

/** The demo Org's sandbox limit, platform's default for an organization. */
export const SANDBOX_LIMIT = 50;
// a chat's sandbox stays awake this long after its last prompt or rename, then pauses and stops counting
const PEBBLE_AWAKE_MS = 10 * 60_000;

/** Whether a chat's sandbox is still awake from its last prompt or rename. */
export const chatAwake = ({ updated_ms }: Pick<ThreadRecord, "updated_ms">, now: number) =>
  now - updated_ms < PEBBLE_AWAKE_MS;
// the service Pebble's sandboxes are started through
const PEBBLE_ACTOR = "cobblestone";
const ID_LENGTH = 8;

// a run holds its own sandbox, plus one per trial run-evals plays side by side
const slotsOf = (run: JobRun) => (run.job === RUN_EVALS_JOB ? 1 + RUN_TRIALS : 1);

/** One Agent's share of the Org's sandboxes: each unfinished job run's reservation and each chat used lately. */
export function sandboxUsage({
  agentId,
  viewer,
  runs,
  threads,
  now,
}: {
  agentId: string;
  viewer: string;
  runs: readonly JobRun[];
  threads: readonly ThreadRecord[];
  now: number;
}): SandboxUsage {
  const unfinished = runs.filter(({ status }) => status !== "completed");
  const reservations = unfinished.map((run) => ({
    run: run.id,
    sandboxes: slotsOf(run),
    created_at: run.created_at,
  }));
  // a queued run has reserved its slots, and starts its sandboxes once it runs
  const jobSandboxes = unfinished
    .filter(({ status }) => status === "in_progress")
    .flatMap((run) =>
      Array.from({ length: slotsOf(run) }, (_, index) => ({
        id: `${run.id.slice(0, ID_LENGTH)}-${index}`,
        creator: `agent:${agentId}`,
        actor: null,
        run: run.id,
        created_at: run.started_at ?? run.created_at,
      })),
    );
  const pebbleSandboxes = threads
    .filter((thread) => chatAwake(thread, now))
    .map(({ id, updated_ms }) => ({
      id: id.slice(0, ID_LENGTH),
      creator: viewer,
      actor: PEBBLE_ACTOR,
      run: null,
      created_at: new Date(updated_ms).toISOString(),
    }));
  return {
    limit: SANDBOX_LIMIT,
    used: reservations.reduce((sum, { sandboxes }) => sum + sandboxes, 0) + pebbleSandboxes.length,
    sandboxes: [...jobSandboxes, ...pebbleSandboxes],
    reservations,
  };
}
