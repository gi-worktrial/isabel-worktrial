import type { JobRun } from "#src/sdk/index";

export function jobRun(overrides: Partial<JobRun> = {}): JobRun {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    agent: "acme",
    job: "run-evals",
    trigger: "workflow_dispatch",
    ref: "main",
    sha: "a".repeat(40),
    definition_commit: "b".repeat(40),
    dry_run: false,
    inputs: {},
    status: "completed",
    conclusion: "success",
    phase: "done",
    exit_code: 0,
    steps: [],
    priority: 0,
    concurrency_group: "run-evals",
    replaced_by: null,
    parent_run_id: null,
    created_by: "user:viewer",
    error: null,
    cancel_requested_at: null,
    created_at: "2026-09-03T00:00:00Z",
    started_at: null,
    completed_at: null,
    cleaned_at: null,
    ...overrides,
  };
}
