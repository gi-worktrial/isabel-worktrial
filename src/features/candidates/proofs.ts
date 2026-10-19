import type { CandidateResults, CandidateStatus, JobRun, RegisteredEval } from "#src/sdk/index";

/** Whether a Candidate in this status needs a change to it, which is Debug's work. */
export function needsDebug(
  status: CandidateStatus,
): status is "not_fixed" | "regresses" | "run_failed" {
  return status === "not_fixed" || status === "regresses" || status === "run_failed";
}

/** A run's registry and which Evals passed in it, as `runEvalsQuery` reads them. */
export type RunEvals = {
  evals: ReadonlyArray<Pick<RegisteredEval, "id" | "title" | "issues">>;
  results: ReadonlyArray<{ eval: string; passed: boolean }>;
};

export type ProofKind = "reproduction" | "fix" | "safety" | "coverage";
/** `unknown` when there is nothing to judge by yet, such as no baseline. */
export type ProofStatus = "pass" | "fail" | "running" | "unknown";

export type Proof = {
  kind: ProofKind;
  status: ProofStatus;
  /** What passing means, such as "New Evals fail on the baseline". */
  claim: string;
  /** How many of the Evals it counts hold up, when there is a run to count. */
  count: { passed: number; total: number } | undefined;
  /** Why it doesn't pass, when it doesn't. */
  note: string | undefined;
};

export const PROOF_TITLES = {
  reproduction: "Reproduction",
  fix: "Fix",
  safety: "Regression safety",
  coverage: "Coverage",
} as const satisfies Record<ProofKind, string>;

const CLAIMS = {
  reproduction: "New Evals fail on the baseline",
  fix: "New Evals pass on this Candidate",
  safety: "Existing Evals keep passing",
  coverage: "Every Eval ran on the current test merge",
} as const satisfies Record<ProofKind, string>;

const evals = (count: number) => (count === 1 ? "1 Eval" : `${count} Evals`);
const newEvals = (count: number) => (count === 1 ? "1 New Eval" : `${count} New Evals`);
const titles = (run: RunEvals | undefined, ids: readonly string[]) =>
  ids.map((id) => run?.evals.find((entry) => entry.id === id)?.title ?? id).join(", ");

const passedIn = (run: RunEvals, id: string) =>
  run.results.some((result) => result.eval === id && result.passed);

const proof = (
  kind: ProofKind,
  status: ProofStatus,
  count?: Proof["count"],
  note?: string,
): Proof => ({ kind, status, claim: CLAIMS[kind], count, note });

function reproduction(issue: string, run: RunEvals | undefined, baseline: Baseline | undefined) {
  if (baseline === undefined) {
    return proof(
      "reproduction",
      "unknown",
      undefined,
      "The Issue's Evals haven't run on the baseline yet",
    );
  }
  if (baseline.evals === undefined) {
    return proof("reproduction", "running", undefined, "The baseline is running");
  }
  // the Candidate's own registry names its New Evals, else the baseline's before its first run
  const ids = (run ?? baseline.evals).evals
    .filter(({ issues }) => issues.includes(issue))
    .map(({ id }) => id);
  if (ids.length === 0) {
    return proof("reproduction", "fail", undefined, "No New Evals check this Issue yet");
  }

  const outcome = (id: string) => baseline.evals?.results.find((result) => result.eval === id);
  const passing = ids.filter((id) => outcome(id)?.passed === true);
  const missing = ids.filter((id) => outcome(id) === undefined);
  const count = { passed: ids.length - passing.length - missing.length, total: ids.length };
  if (passing.length > 0) {
    const verb =
      passing.length === 1
        ? "passes on the baseline, so it doesn't"
        : "pass on the baseline, so they don't";
    return proof(
      "reproduction",
      "fail",
      count,
      `${titles(run ?? baseline.evals, passing)} ${verb} show the Issue`,
    );
  }
  return missing.length > 0
    ? proof(
        "reproduction",
        "unknown",
        count,
        `${newEvals(missing.length)} didn't run on the baseline`,
      )
    : proof("reproduction", "pass", count);
}

function fix(issue: string, results: CandidateResults, run: RunEvals | undefined) {
  const { new_evals } = results;
  if (new_evals === undefined) {
    return proof("fix", "running");
  }
  if (new_evals.total === 0) {
    return proof("fix", "fail", new_evals, "No New Evals check this Issue yet");
  }
  if (new_evals.passed === new_evals.total) {
    return proof("fix", "pass", new_evals);
  }

  const failing =
    run?.evals
      .filter(({ id, issues }) => issues.includes(issue) && !passedIn(run, id))
      .map(({ id }) => id) ?? [];
  return proof(
    "fix",
    "fail",
    new_evals,
    failing.length === 0
      ? `${newEvals(new_evals.total - new_evals.passed)} still fail`
      : `Still fails ${titles(run, failing)}`,
  );
}

function safety(results: CandidateResults, run: RunEvals | undefined) {
  const { existing_evals, regressions } = results;
  if (existing_evals === undefined) {
    return proof("safety", "running");
  }
  if (regressions === undefined) {
    return proof(
      "safety",
      "unknown",
      existing_evals,
      "No baseline over the same Evals to compare with",
    );
  }
  if (regressions.length > 0) {
    return proof("safety", "fail", existing_evals, `Regressed ${titles(run, regressions)}`);
  }

  const failing = existing_evals.total - existing_evals.passed;
  return proof(
    "safety",
    "pass",
    existing_evals,
    failing === 0
      ? undefined
      : `${evals(failing)} also ${failing === 1 ? "fails" : "fail"} on the baseline`,
  );
}

function coverage(results: CandidateResults | undefined, run: RunEvals | undefined) {
  if (results === undefined) {
    return proof("coverage", "fail", undefined, "This Candidate's Evals haven't run");
  }

  const ran = run && {
    passed: run.evals.filter(({ id }) => run.results.some((result) => result.eval === id)).length,
    total: run.evals.length,
  };
  if (results.run.status !== "completed") {
    return proof("coverage", "running", ran);
  }
  if (results.outdated) {
    return proof("coverage", "fail", ran, "These results are for an older test merge");
  }
  if (results.run.conclusion !== "success") {
    return proof("coverage", "fail", ran, "The Eval run didn't succeed");
  }
  return ran !== undefined && ran.passed < ran.total
    ? proof("coverage", "fail", ran, `${evals(ran.total - ran.passed)} didn't run`)
    : proof("coverage", "pass", ran);
}

/** The Issue's baseline run, with its Evals once it completes. */
export type Baseline = { run: JobRun; evals: RunEvals | undefined };

/**
 * The four proofs behind a Candidate's status: its New Evals fail on the baseline (reproduction), pass on the Candidate
 * (fix), no Existing Eval regressed (regression safety), and every Eval ran on its current test merge (coverage).
 */
export function candidateProofs({
  issue,
  results,
  run,
  baseline,
}: {
  issue: string;
  results: CandidateResults | undefined;
  /** The Candidate's newest run's registry and results, undefined before it has any. */
  run: RunEvals | undefined;
  /** Undefined before the Issue's first baseline run. */
  baseline: Baseline | undefined;
}): Proof[] {
  return [
    reproduction(issue, run, baseline),
    results === undefined ? proof("fix", "unknown") : fix(issue, results, run),
    results === undefined ? proof("safety", "unknown") : safety(results, run),
    coverage(results, run),
  ];
}

/** What changed between two runs of a Candidate: Evals that pass now and didn't, and Evals that fail now and passed. */
export function runChange(previous: RunEvals, current: RunEvals) {
  const before = (id: string) => previous.results.find((result) => result.eval === id)?.passed;
  return current.results.reduce(
    (change, { eval: id, passed }) =>
      passed && before(id) !== true
        ? { ...change, fixed: change.fixed + 1 }
        : !passed && before(id) === true
          ? { ...change, broke: change.broke + 1 }
          : change,
    { fixed: 0, broke: 0 },
  );
}
