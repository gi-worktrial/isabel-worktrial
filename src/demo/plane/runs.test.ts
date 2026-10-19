import { expect, test } from "vitest";

import { jobRun } from "#test/job-run";

import { evalRunAt, jobRunAt, type Submitted } from "./runs.ts";

function outcome() {
  return { reward: 1, cost_usd: 0.1, trace_id: "trace" };
}

function submitted(): Submitted {
  return {
    run: jobRun({ status: "queued", conclusion: null, phase: "queued", exit_code: null }),
    created_ms: 0,
    tasks: ["task"],
  };
}

test("replay exposes the full native lifecycle and preserves trial timing", () => {
  const input = submitted();
  const at = (now: number) => evalRunAt(input, now, 100, "Baseline", outcome, () => 250);
  expect(at(0).run).toMatchObject({
    status: "queued",
    conclusion: null,
    started_at: null,
    completed_at: null,
  });
  expect(at(100).run).toMatchObject({ status: "in_progress", conclusion: null, phase: "running" });
  const finished = at(200);
  expect(finished.run).toMatchObject({
    status: "completed",
    conclusion: "success",
    phase: "done",
    exit_code: 0,
  });
  expect(finished.trials[0]?.finished_at).toBe(finished.run.completed_at);
  expect(finished.run.cleaned_at).toBe(finished.run.completed_at);
  expect(finished.trials[0]).toMatchObject({
    started_at: new Date(100).toISOString(),
    finished_at: new Date(350).toISOString(),
  });
  expect(
    Date.parse(finished.run.completed_at ?? "") - Date.parse(finished.run.started_at ?? ""),
  ).toBe(250);
  // the trial replays its recorded Trace, whose Grades the client derives from the task's Criteria
  expect(finished.trials[0]).toMatchObject({ task: "task", recorded: "trace", cost_usd: 0.1 });
  expect(finished.run).not.toHaveProperty("labels");
  expect(finished.run).not.toHaveProperty("summary");
  expect(finished.run).not.toHaveProperty("finished_at");
});

test("cancellation wins over an unknown recording and keeps the request timestamp", () => {
  const input = { ...submitted(), cancelled_ms: 600 };
  const played = jobRunAt(input, 2000);
  expect(played.run).toMatchObject({
    status: "completed",
    conclusion: "cancelled",
    error: null,
    started_at: new Date(500).toISOString(),
    exit_code: null,
  });
  expect(played.run.cancel_requested_at).toBe(new Date(600).toISOString());
  expect(played.run.completed_at).toBe(played.run.cancel_requested_at);
  expect(played).not.toHaveProperty("result");
});

test("unknown code produces a failed run and never fabricates a result", () => {
  const played = jobRunAt(submitted(), 2000);
  expect(played.run).toMatchObject({
    status: "completed",
    conclusion: "failure",
    exit_code: 1,
    error: "No recorded result for this Automation's edited code",
  });
  expect(played.logs).toEqual([played.run.error]);
  expect(played).not.toHaveProperty("result");
});
