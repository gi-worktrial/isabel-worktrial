import { describe, expect, it } from "vitest";

import { type ComparedRun, compareEvals, countDifferences } from "./compare.ts";

const run = (
  passed: Record<string, boolean>,
  regressions: string[] = [],
  evals = [
    { id: "new-a", title: "New A", issues: ["ISS-1"] },
    { id: "old-a", title: "Old A", issues: [] },
    { id: "old-b", title: "Old B", issues: ["ISS-2"] },
  ],
): ComparedRun => ({
  evals,
  results: Object.entries(passed).map(([id, pass]) => ({ eval: id, passed: pass })),
  regressions,
});

describe("compareEvals", () => {
  it("puts differences first, then New before Existing, then failures", () => {
    const rows = compareEvals(
      "ISS-1",
      run({ "new-a": true, "old-a": true, "old-b": false }),
      run({ "new-a": false, "old-a": true, "old-b": false }, ["old-a"]),
    );

    expect(rows.map(({ id, group, a, b }) => [id, group, a, b])).toEqual([
      ["new-a", "new", "passed", "failed"],
      ["old-b", "existing", "failed", "failed"],
      ["old-a", "existing", "passed", "passed"],
    ]);
    expect(rows.find(({ id }) => id === "old-a")?.regressed).toEqual({ a: false, b: true });
    expect(countDifferences(rows)).toBe(1);
  });

  it("reads an Eval only one side registered or ran as not run on the other", () => {
    const rows = compareEvals(
      "ISS-1",
      run({ "new-a": true }, [], [{ id: "new-a", title: "New A", issues: ["ISS-1"] }]),
      run(
        { "new-a": true, "new-b": false },
        [],
        [
          { id: "new-a", title: "New A", issues: ["ISS-1"] },
          { id: "new-b", title: "New B", issues: ["ISS-1"] },
        ],
      ),
    );

    expect(rows[0]).toMatchObject({ id: "new-b", a: "not_run", b: "failed" });
  });

  it("compares against a Candidate that hasn't run", () => {
    const rows = compareEvals("ISS-1", undefined, run({ "new-a": true }));

    expect(rows.every(({ a }) => a === "not_run")).toBe(true);
    expect(rows.map(({ id }) => id)).toEqual(["new-a", "old-a", "old-b"]);
  });
});
