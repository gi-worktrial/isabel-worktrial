// the Traces list's read rules our patches add to platform's list and Issue Traces

/** The annotation counts for the Traces a source lists. Platform counts every Trace with no trial filter, and Trace
 * annotation skips Eval trials, so Eval runs list none of them. */
export const sourceCounts = <Count>(
  { source }: { source?: string | undefined },
  counts: Count[],
) => (source === "eval" ? [] : counts);

/** Traces newest first, so a Trace added to an Issue by hand sits by its time among the matched ones. */
export const newestFirst = <T extends { started_at: string }>(traces: readonly T[]) =>
  traces.toSorted((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
