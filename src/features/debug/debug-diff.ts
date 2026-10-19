import { useQuery } from "@tanstack/react-query";

import { treeQuery } from "#/queries";
import { comparisonQuery } from "#src/queries/extra";
import { getEvalsBranchById } from "#src/sdk/issues";

/** A Candidate's basehead: its head against the Issue's evals branch, which it opened from. */
export const candidateBasehead = (issue: string, head: string) =>
  `${getEvalsBranchById(issue)}...${head}`;

/**
 * The tree Debug's Diff measures a branch from: where `basehead`'s head left its base, as the pull request's files
 * do. Undefined while it loads, with the failed read's error and a retry of just that read.
 */
export function useDebugDiff({
  orgId,
  agent,
  basehead,
}: {
  orgId: string;
  agent: string;
  basehead: string;
}) {
  const comparison = useQuery(comparisonQuery({ orgId, agent, basehead }));
  const mergeBase = comparison.data?.merge_base_commit.sha;
  const base = useQuery({
    ...treeQuery({ orgId, agent, ref: mergeBase ?? "" }),
    enabled: mergeBase !== undefined,
  });
  return {
    base: base.data,
    error: comparison.error ?? base.error,
    // the base tree waits for the comparison, so only the read that failed runs again
    retry: () => void (comparison.error === null ? base : comparison).refetch(),
  };
}
