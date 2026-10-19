import { z } from "zod";

import { PullsSchema } from "./pulls.ts";
import { RepoSchema } from "./repo.ts";
import { JobsSchema, RunsSchema } from "./runs.ts";
import { TraceIndexSchema } from "./traces.ts";

const ScenarioSchema = z.strictObject({
  agent: z.string(),
  repository: z.string(),
  org_id: z.string(),
  run_step_ms: z.number(),
});
const OutcomeSchema = z.strictObject({
  reward: z.number(),
  cost_usd: z.number(),
  trace_id: z.string(),
});
const OutcomesSchema = z.record(z.string(), z.record(z.string(), OutcomeSchema));
// each recorded trial's raw Criterion scores, labeled against the pass mark when a run replays it
const RecordedGradeSchema = z.strictObject({
  value: z.number(),
  raw: z.string().nullable(),
  description: z.string(),
  reasoning: z.string().nullable(),
});
const RecordedGradesSchema = z.record(z.string(), z.record(z.string(), RecordedGradeSchema));

/** The same file validators for demo-data's writer and Product's reader. */
export const SeedFileSchemas = {
  repo: RepoSchema,
  pulls: PullsSchema,
  traces: TraceIndexSchema,
  scenario: ScenarioSchema,
  runs: RunsSchema,
  outcomes: OutcomesSchema,
  grades: RecordedGradesSchema,
  jobs: JobsSchema,
} as const;
