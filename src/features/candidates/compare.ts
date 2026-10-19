import type { RegisteredEval } from "#src/sdk/index";

export type EvalOutcome = "passed" | "failed" | "not_run";

/** One side of a comparison: the registry its run read and which Evals passed in it. */
export type ComparedRun = {
  evals: ReadonlyArray<Pick<RegisteredEval, "id" | "title" | "issues">>;
  results: ReadonlyArray<{ eval: string; passed: boolean }>;
  regressions: readonly string[];
};

export type ComparedEval = {
  id: string;
  title: string;
  group: "new" | "existing";
  a: EvalOutcome;
  b: EvalOutcome;
  /** Which sides regressed it against the Issue's baseline. */
  regressed: { a: boolean; b: boolean };
};

const outcome = (run: ComparedRun | undefined, id: string): EvalOutcome => {
  const result = run?.results.find((each) => each.eval === id);
  return result === undefined ? "not_run" : result.passed ? "passed" : "failed";
};

const OUTCOME_RANK = { failed: 0, not_run: 1, passed: 2 } as const;

/** Every Eval either run registered, with each side's outcome: differences first, then New before Existing, then failures first. */
export function compareEvals(
  issue: string,
  a: ComparedRun | undefined,
  b: ComparedRun | undefined,
): ComparedEval[] {
  const registered = new Map<string, Pick<RegisteredEval, "id" | "title" | "issues">>();
  for (const entry of [...(a?.evals ?? []), ...(b?.evals ?? [])]) {
    if (!registered.has(entry.id)) {
      registered.set(entry.id, entry);
    }
  }

  const rows = [...registered.values()].map(({ id, title, issues }) => ({
    id,
    title,
    group: issues.includes(issue) ? ("new" as const) : ("existing" as const),
    a: outcome(a, id),
    b: outcome(b, id),
    regressed: {
      a: a?.regressions.includes(id) === true,
      b: b?.regressions.includes(id) === true,
    },
  }));

  return rows.toSorted(
    (left, right) =>
      Number(left.a === left.b) - Number(right.a === right.b) ||
      Number(left.group === "existing") - Number(right.group === "existing") ||
      Math.min(OUTCOME_RANK[left.a], OUTCOME_RANK[left.b]) -
        Math.min(OUTCOME_RANK[right.a], OUTCOME_RANK[right.b]) ||
      left.title.localeCompare(right.title),
  );
}

/** How many Evals differ between the two sides. */
export const countDifferences = (rows: readonly ComparedEval[]) =>
  rows.filter(({ a, b }) => a !== b).length;
