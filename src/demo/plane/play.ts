/** A recorded step's elapsed time and log text. */
export type Step = { at: number; line: string };

/** Consecutive trials that run together, with the caller's slot count. */
export function batches<T>(items: readonly T[], slots: number): T[][] {
  const grouped: T[][] = [];
  for (let index = 0; index < items.length; index += slots) {
    grouped.push(items.slice(index, index + slots));
  }
  return grouped;
}

/** A recorded log line's elapsed time, as "0:42 Graded 120 Traces" starts. */
export function stepAt(line: string): number {
  const [, minutes, seconds] = /^(\d+):(\d\d) .*$/u.exec(line) ?? [];
  return minutes === undefined ? 0 : (Number(minutes) * 60 + Number(seconds)) * 1000;
}

// as recorded logs print elapsed time
export const clockOf = (ms: number) =>
  `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

/** A run's log line for a step. */
export const stamp = ({ at, line }: Step) => `${clockOf(at)} ${line}`;

/** A number and its noun on one line, with thousands grouped for interactive logs. */
export const counted = (total: number, noun: string, groupThousands = false) =>
  `${groupThousands ? total.toLocaleString("en-US") : total}\u00a0${noun}${total === 1 ? "" : "s"}`;

/** Only a recorded passing reward passes, so a missing recording never does. */
export const passedEval = (recorded: { reward: number } | undefined) =>
  recorded !== undefined && recorded.reward >= 1;

/** The summary shared by recorded and interactive Eval runs. */
export const evalSummary = (passed: number, total: number) => `${passed} of ${total} passed`;

export const evalSubject = (who: string) => (who === "Baseline" ? "the baseline" : who);

/** The completed Eval step shared by recorded and interactive runs. */
export const ranEvals = (total: number, who: string, groupThousands = false) =>
  `Ran ${counted(total, "Eval", groupThousands)} on ${evalSubject(who)}`;
