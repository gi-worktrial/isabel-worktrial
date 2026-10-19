import { z } from "zod";
import { type Api, query } from "./api.ts";

const inputValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);

const inputSchema = z.object({
  type: z.enum(["string", "number", "boolean", "choice", "array"]),
  description: z.string().optional(),
  required: z.boolean(),
  default: inputValueSchema.optional(),
  options: z.array(z.string()).optional(),
});

const refFiltersSchema = z.object({
  branches: z.array(z.string()).optional(),
  "branches-ignore": z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
  "paths-ignore": z.array(z.string()).optional(),
});

/** A job's triggers, as GitHub Actions' `on` writes them. */
const triggersSchema = z.object({
  workflow_dispatch: z.object({}).optional(),
  push: refFiltersSchema.optional(),
  pull_request: refFiltersSchema.extend({ types: z.array(z.string()).optional() }).optional(),
  /** Five-field cron expressions in UTC. */
  schedule: z.array(z.object({ cron: z.string() })).optional(),
});

const jobSchema = z.discriminatedUnion("state", [
  z.object({
    name: z.string(),
    state: z.literal("active"),
    display_name: z.string().nullable(),
    model: z.string().nullable(),
    on: triggersSchema,
    inputs: z.record(z.string(), inputSchema),
    permissions: z.record(z.string(), z.string()),
    concurrency: z.object({ group: z.string(), "cancel-in-progress": z.boolean() }),
    timeout_minutes: z.number(),
    concurrent_sandboxes: z.union([z.number(), z.string()]),
    vcpus: z.number(),
    mem_mib: z.number(),
    steps: z.array(
      z.union([
        z.object({ name: z.string(), run: z.string(), exclude_from_context: z.boolean() }),
        z.object({ name: z.string(), prompt: z.string() }),
        z.object({ name: z.string(), prompt_file: z.string() }),
      ]),
    ),
  }),
  /** A `job.toml` that doesn't parse or validate, which can't run until it's fixed. */
  z.object({ name: z.string(), state: z.literal("invalid"), error: z.string() }),
]);

/** A step of a run, as GitHub's jobs API returns it. */
const stepSchema = z.object({
  number: z.number(),
  name: z.string(),
  status: z.enum(["queued", "in_progress", "completed"]),
  conclusion: z
    .enum(["success", "failure", "skipped", "cancelled", "timed_out", "lost"])
    .nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  prompt_entry: z.number().nullable(),
});

const runSchema = z.object({
  id: z.uuid(),
  agent: z.string(),
  job: z.string(),
  trigger: z.enum(["workflow_dispatch", "push", "pull_request", "schedule"]),
  ref: z.string(),
  sha: z.string(),
  /** The commit the job's definition was read at (on `main` unless it's a dry run). */
  definition_commit: z.string(),
  dry_run: z.boolean(),
  inputs: z.record(z.string(), inputValueSchema),
  status: z.enum(["queued", "in_progress", "completed"]),
  conclusion: z.enum(["success", "failure", "cancelled", "timed_out", "lost"]).nullable(),
  phase: z.enum(["queued", "preparing", "running", "collecting", "cleaning", "done"]),
  exit_code: z.number().nullable(),
  steps: z.array(stepSchema),
  priority: z.number(),
  concurrency_group: z.string(),
  /** The run that replaced this one while it was queued. */
  replaced_by: z.uuid().nullable(),
  parent_run_id: z.uuid().nullable(),
  created_by: z.string(),
  error: z.string().nullable(),
  cancel_requested_at: z.string().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  cleaned_at: z.string().nullable(),
});

const artifactSchema = z.object({ path: z.string(), size: z.number() });

export type Job = z.infer<typeof jobSchema>;
export type JobInput = z.infer<typeof inputSchema>;
export type JobRun = z.infer<typeof runSchema>;
export type InputValue = z.infer<typeof inputValueSchema>;
export type Artifact = z.infer<typeof artifactSchema>;

export type DispatchOptions = {
  agent: string;
  job: string;
  /** The branch, tag, or commit to run against (`main` by default). */
  ref?: string | undefined;
  /** String forms (`"3"`, `"true"`, `"a"` for `["a"]`) are parsed by each input's type. */
  inputs?: Record<string, InputValue> | undefined;
  /** Tests the job without publishing: its token can only read (plus use its sandboxes), and `grounded` writes what it would send to `$GROUNDED_OUTPUTS`. */
  dry_run?: boolean | undefined;
  /** The branch a dry run reads the job from (`main` by default). */
  definition_ref?: string | undefined;
};

export type ListRunsOptions = {
  agent: string;
  job?: string | undefined;
  status?: JobRun["status"] | undefined;
  /** A branch, or a glob as in rulesets (`issue/<id>/**`). */
  branch?: string | undefined;
  page?: number | undefined;
  per_page?: number | undefined;
};

export type LogsOptions = {
  /** Skips the log's first `offset` bytes, so a poll reads only what's new. */
  offset?: number | undefined;
};

export type RunTarget = { agent: string; run: string };
export type ArtifactTarget = RunTarget & { path: string };

/** The jobs in an agent's repo (`jobs/<name>/job.toml` on `main`) and their runs. */
export class Jobs {
  constructor(private readonly api: Api) {}

  async list({ agent }: { agent: string }): Promise<Job[]> {
    return (await this.api.json(`${agentPath(agent)}/jobs`, z.object({ jobs: z.array(jobSchema) })))
      .jobs;
  }

  get({ agent, job }: { agent: string; job: string }): Promise<Job> {
    return this.api.json(`${agentPath(agent)}/jobs/${encodeURIComponent(job)}`, jobSchema);
  }

  /** Queues a run, or returns the queued one when it has the same ref and inputs (needs `job:run`). */
  dispatch({ agent, job, ...body }: DispatchOptions): Promise<JobRun> {
    return this.api.json(
      `${agentPath(agent)}/jobs/${encodeURIComponent(job)}/dispatches`,
      runSchema,
      { method: "POST", body: JSON.stringify(body) },
    );
  }

  /** Newest first. */
  async listRuns({ agent, ...filters }: ListRunsOptions): Promise<JobRun[]> {
    return (
      await this.api.json(
        `${agentPath(agent)}/runs${query(filters)}`,
        z.object({ runs: z.array(runSchema) }),
      )
    ).runs;
  }

  getRun(target: RunTarget): Promise<JobRun> {
    return this.api.json(runPath(target), runSchema);
  }

  /** Requests cancellation. Queued runs are cancelled immediately. */
  cancelRun(target: RunTarget): Promise<JobRun> {
    return this.api.json(`${runPath(target)}/cancel`, runSchema, { method: "POST" });
  }

  /** Step `step`'s output so far (up to 50 MiB from `offset`). */
  async logs(target: RunTarget, step: number, options: LogsOptions = {}): Promise<Uint8Array> {
    const response = await this.api.request(
      `${runPath(target)}/steps/${step}/logs${query(options)}`,
    );
    return new Uint8Array(await response.arrayBuffer());
  }

  /** The files the run's steps wrote under `$GROUNDED_OUTPUTS`, uploaded once it completed. */
  async listArtifacts(target: RunTarget): Promise<Artifact[]> {
    return (
      await this.api.json(
        `${runPath(target)}/artifacts`,
        z.object({ artifacts: z.array(artifactSchema) }),
      )
    ).artifacts;
  }

  async getArtifact(target: ArtifactTarget): Promise<Uint8Array> {
    return new Uint8Array(await (await this.artifactResponse(target)).arrayBuffer());
  }

  /** An artifact's content as it arrives, for writing a large file without holding it in memory. */
  async streamArtifact(target: ArtifactTarget): Promise<ReadableStream<Uint8Array>> {
    const { body } = await this.artifactResponse(target);
    if (!body) {
      throw new Error(`Artifact ${target.path} has no body`);
    }

    return body;
  }

  /** Every artifact's content, by path. */
  async downloadArtifacts(target: RunTarget): Promise<Map<string, Uint8Array>> {
    const artifacts = await this.listArtifacts(target);
    const contents = await Promise.all(
      artifacts.map(({ path }) => this.getArtifact({ ...target, path })),
    );
    return new Map(artifacts.map(({ path }, i) => [path, contents[i] ?? new Uint8Array()]));
  }

  private artifactResponse({ path, ...target }: ArtifactTarget) {
    return this.api.request(`${runPath(target)}/artifacts/${encodePath(path)}`);
  }
}

function agentPath(agent: string) {
  return `/agents/${encodeURIComponent(agent)}`;
}

function runPath({ agent, run }: RunTarget) {
  return `${agentPath(agent)}/runs/${encodeURIComponent(run)}`;
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}
