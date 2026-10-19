import {
  RUN_EVALS_JOB,
  type EvalResult,
  type RunTarget,
} from "@grounded-intelligence/grounded-sdk";
import type { ProductClient } from "#src/queries/client";

export type JobOutput = EvalResult[];
export const JOB_OUTPUTS = new Map<
  string,
  (client: ProductClient, target: RunTarget) => Promise<JobOutput>
>([[RUN_EVALS_JOB, async (client, target) => (await client.evals.getRun(target)).results]]);
