import { describe, expect, it } from "vitest";

import {
  type Baseline,
  type RunEvals,
  candidateProofs,
  runChange,
} from "#src/features/candidates/proofs";
import type { CandidateResults, JobRun } from "#src/sdk/index";

const ISSUE = "ISS-1";
const run = (
  status: JobRun["status"] = "completed",
  conclusion: JobRun["conclusion"] = "success",
) => ({ id: "run", sha: "abc", status, conclusion }) as unknown as JobRun;

const REGISTRY = [
  { id: "new-1", title: "New one", issues: [ISSUE] },
  { id: "new-2", title: "New two", issues: [ISSUE] },
  { id: "old-1", title: "Old one", issues: [] },
  { id: "old-2", title: "Old two", issues: [] },
];
const evals = (passed: Record<string, boolean>, registry = REGISTRY): RunEvals => ({
  evals: registry,
  results: Object.entries(passed).map(([id, pass]) => ({ eval: id, passed: pass })),
});
const ALL_PASS = { "new-1": true, "new-2": true, "old-1": true, "old-2": true };
const BASELINE: Baseline = {
  run: run(),
  evals: evals({ "new-1": false, "new-2": false, "old-1": true, "old-2": true }),
};
const results = (overrides: Partial<CandidateResults> = {}): CandidateResults => ({
  run: run(),
  outdated: false,
  new_evals: { passed: 2, total: 2 },
  existing_evals: { passed: 2, total: 2 },
  regressions: [],
  ...overrides,
});

const proofs = (
  candidate: CandidateResults | undefined,
  candidateRun: RunEvals | undefined = evals(ALL_PASS),
  baseline: Baseline | undefined = BASELINE,
) => candidateProofs({ issue: ISSUE, results: candidate, run: candidateRun, baseline });
const status = (outcome: ReturnType<typeof proofs>) =>
  Object.fromEntries(outcome.map(({ kind, status: each }) => [kind, each]));

describe("candidateProofs", () => {
  it("all hold when the New Evals fail on the baseline, pass here, nothing regressed and every Eval ran", () => {
    const outcome = proofs(results());
    expect(status(outcome)).toEqual({
      reproduction: "pass",
      fix: "pass",
      safety: "pass",
      coverage: "pass",
    });
    expect(outcome.map(({ count }) => count)).toEqual([
      { passed: 2, total: 2 },
      { passed: 2, total: 2 },
      { passed: 2, total: 2 },
      { passed: 4, total: 4 },
    ]);
  });

  it("fails coverage before the Candidate's first run", () => {
    expect(status(proofs(undefined, undefined))).toEqual({
      reproduction: "pass",
      fix: "unknown",
      safety: "unknown",
      coverage: "fail",
    });
  });

  it("runs while its run runs, whatever the baseline does", () => {
    const pending = results({
      run: run("in_progress", null),
      new_evals: undefined,
      existing_evals: undefined,
      regressions: undefined,
    });
    expect(status(proofs(pending, evals({ "new-1": true })))).toMatchObject({
      fix: "running",
      safety: "running",
      coverage: "running",
    });
    const baselineRunning = proofs(results(), undefined, {
      run: run("in_progress", null),
      evals: undefined,
    });
    expect(status(baselineRunning).reproduction).toBe("running");
  });

  it("fails coverage on out-of-date results and on a run that didn't succeed", () => {
    expect(proofs(results({ outdated: true }))[3]).toMatchObject({
      status: "fail",
      note: "These results are for an older test merge",
    });
    expect(proofs(results({ run: run("completed", "failure") }))[3]).toMatchObject({
      status: "fail",
      note: "The Eval run didn't succeed",
    });
  });

  it("fails the fix when a New Eval still fails, naming it", () => {
    const outcome = proofs(
      results({ new_evals: { passed: 1, total: 2 } }),
      evals({ ...ALL_PASS, "new-2": false }),
    );
    expect(outcome[1]).toMatchObject({ status: "fail", note: "Still fails New two" });
  });

  it("fails the fix and reproduction when no New Eval checks the Issue", () => {
    const registry = REGISTRY.filter(({ issues }) => issues.length === 0);
    const outcome = proofs(
      results({ new_evals: { passed: 0, total: 0 } }),
      evals({ "old-1": true, "old-2": true }, registry),
      { run: run(), evals: evals({ "old-1": true, "old-2": true }, registry) },
    );
    expect(outcome[0]).toMatchObject({ status: "fail", note: "No New Evals check this Issue yet" });
    expect(outcome[1]).toMatchObject({ status: "fail", note: "No New Evals check this Issue yet" });
  });

  it("fails regression safety when an Existing Eval regressed, naming it", () => {
    const outcome = proofs(
      results({ existing_evals: { passed: 1, total: 2 }, regressions: ["old-2"] }),
      evals({ ...ALL_PASS, "old-2": false }),
    );
    expect(outcome[2]).toMatchObject({ status: "fail", note: "Regressed Old two" });
  });

  it("notes what holds with a caveat, and what can't be shown yet", () => {
    const failing = proofs(
      results({ existing_evals: { passed: 1, total: 2 } }),
      evals({ ...ALL_PASS, "old-2": false }),
    );
    expect(failing[2]).toMatchObject({
      status: "pass",
      note: "1 Eval also fails on the baseline",
    });
    const shown = proofs(results(), evals(ALL_PASS), {
      run: run(),
      evals: evals({ ...ALL_PASS, "new-2": true, "new-1": false }),
    });
    expect(shown[0]).toMatchObject({
      status: "fail",
      note: "New two passes on the baseline, so it doesn't show the Issue",
      count: { passed: 1, total: 2 },
    });
    const partial = proofs(results(), evals({ "new-1": true, "new-2": true, "old-1": true }));
    expect(partial[3]).toMatchObject({ status: "fail", count: { passed: 3, total: 4 } });
    const noBaseline = candidateProofs({
      issue: ISSUE,
      results: results(),
      run: evals(ALL_PASS),
      baseline: undefined,
    });
    expect(status(noBaseline).reproduction).toBe("unknown");
    expect(status(proofs(results({ regressions: undefined }))).safety).toBe("unknown");
  });
});

describe("runChange", () => {
  it("counts Evals fixed and newly failing since the previous run", () => {
    expect(
      runChange(
        evals({ "new-1": false, "new-2": false, "old-1": true }),
        evals({ "new-1": true, "new-2": false, "old-1": false, "old-2": true }),
      ),
    ).toEqual({ fixed: 2, broke: 1 });
  });
});
