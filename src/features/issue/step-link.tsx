import { Link, useParams } from "@tanstack/react-router";
import type { ReactElement } from "react";

import type { Phase } from "#/issue-view";
import { Tooltip } from "#/ui/tooltip";
import type { Issue } from "#src/sdk/issues";

// where each step is decided: Review on the Candidates tab, Deploy on the approved Candidate.
// a new Issue starts Review from its Overview action, and a resolved one's shipped Candidate is merged, so its record is Activity
function stepTarget(issue: Issue, phase: Phase, orgId: string, agent: string) {
  const params = { orgId, agent, issue: issue.id };
  if (issue.state === "detected") {
    return undefined;
  }
  if (issue.state === "resolved") {
    return { to: "/$orgId/agents/$agent/issues/$issue/activity", params } as const;
  }
  if (phase === "deploy" && issue.approved !== undefined) {
    return {
      to: "/$orgId/agents/$agent/issues/$issue/candidates/$candidate",
      params: { ...params, candidate: issue.approved.candidate },
    } as const;
  }
  return { to: "/$orgId/agents/$agent/issues/$issue/candidates", params } as const;
}

/** A stepper step's label, as a link to where the step is decided once the Issue can reach it, its meaning in the tooltip. */
export function StepLink({
  issue,
  phase,
  tip,
  children,
}: {
  issue: Issue;
  phase: Phase;
  tip: string;
  children: ReactElement;
}) {
  const { orgId, agent } = useParams({ strict: false });
  const target =
    orgId === undefined || agent === undefined ? undefined : stepTarget(issue, phase, orgId, agent);

  return (
    <Tooltip label={tip}>
      {target === undefined ? (
        children
      ) : (
        <Link
          {...target}
          className="-mx-1 flex h-6 items-center rounded-xs px-1 hover:bg-ink/5 motion-safe:transition-colors"
        >
          {children}
        </Link>
      )}
    </Tooltip>
  );
}
