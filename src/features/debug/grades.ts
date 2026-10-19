import { FAIL_LABEL, PASS_LABEL, getGradeCriterion } from "#src/sdk/evals";

type Labelled = { annotations: ReadonlyArray<{ name: string; label: string }> };

// `grounded/grade/reward` grades the whole trial, which its Eval's own mark already shows, and each Criterion grades
// under it
const TRIAL_REWARD = "reward";

/** Each pass-or-fail criterion an Eval's trials were graded on, failing when any trial fails it, failures first. */
export function gradeOutcomes(trials: readonly Labelled[]) {
  const passed = new Map<string, boolean>();
  for (const annotation of trials.flatMap(({ annotations }) => annotations)) {
    const criterion = getGradeCriterion(annotation);
    if (
      criterion === undefined ||
      criterion === TRIAL_REWARD ||
      ![PASS_LABEL, FAIL_LABEL].includes(annotation.label)
    ) {
      continue;
    }
    passed.set(criterion, (passed.get(criterion) ?? true) && annotation.label === PASS_LABEL);
  }

  return [...passed]
    .map(([criterion, pass]) => ({ criterion, passed: pass }))
    .toSorted(
      (a, b) => Number(a.passed) - Number(b.passed) || a.criterion.localeCompare(b.criterion),
    );
}
