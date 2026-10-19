import { z } from "zod";

import type { JobRun } from "#src/sdk/index";

// the SDK keeps its response validator private, so seeds validate the same wire record here
const InputValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
/** A job run as platform's jobs API returns it. */
export const JobRunSchema = z.strictObject({
  id: z.uuid(),
  agent: z.string(),
  job: z.string(),
  trigger: z.enum(["workflow_dispatch", "push", "pull_request", "schedule"]),
  ref: z.string(),
  sha: z.string(),
  definition_commit: z.string(),
  dry_run: z.boolean(),
  inputs: z.record(z.string(), InputValueSchema),
  status: z.enum(["queued", "in_progress", "completed"]),
  conclusion: z.enum(["success", "failure", "cancelled", "timed_out", "lost"]).nullable(),
  phase: z.enum(["queued", "preparing", "running", "collecting", "cleaning", "done"]),
  exit_code: z.number().nullable(),
  steps: z.array(
    z.strictObject({
      number: z.number(),
      name: z.string(),
      status: z.enum(["queued", "in_progress", "completed"]),
      conclusion: z
        .enum(["success", "failure", "skipped", "cancelled", "timed_out", "lost"])
        .nullable(),
      started_at: z.string().nullable(),
      completed_at: z.string().nullable(),
      prompt_entry: z.number().nullable(),
    }),
  ),
  priority: z.number(),
  concurrency_group: z.string(),
  replaced_by: z.uuid().nullable(),
  parent_run_id: z.uuid().nullable(),
  created_by: z.string(),
  error: z.string().nullable(),
  cancel_requested_at: z.string().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  cleaned_at: z.string().nullable(),
}) satisfies z.ZodType<JobRun>;

const CountsSchema = z.record(z.string(), z.union([z.number(), z.array(z.number())]));
/** A trial a recorded run played, replaying the recorded trial trace `trace_id`. */
const SeedTrialSchema = z.strictObject({
  trial: z.string(),
  task: z.string(),
  trace_id: z.string(),
  started_at: z.string(),
  finished_at: z.string(),
  cost_usd: z.number(),
});
/**
 * A stored run with its logs, result and trials; its steps come from its job.toml on load, and `annotated` says the
 * evaluations it exported sit in `logs/<id>.json`.
 */
export const SeedRunSchema = JobRunSchema.omit({ steps: true })
  .extend({
    trials: z.array(SeedTrialSchema).optional(),
    logs: z.array(z.string()),
    result: CountsSchema.optional(),
    annotated: z.literal(true).optional(),
    // the source kind the run's job token posts its evaluations with, as platform's annotations carry it
    annotation_kind: z.enum(["code", "llm"]).optional(),
  })
  .strict();
export const RunsSchema = z.array(SeedRunSchema);

/** A job's replay and the code commit it requires, including any seeded live run. */
const RecordedJobSchema = z.strictObject({
  duration_ms: z.number(),
  logs: z.array(z.string()),
  result: CountsSchema.optional(),
  source_commit: z.string(),
  live: z
    .strictObject({
      id: z.string(),
      trigger: JobRunSchema.shape.trigger,
      created_by: z.string(),
      elapsed_ms: z.number(),
    })
    .optional(),
});
export const JobsSchema = z.record(z.string(), RecordedJobSchema);
