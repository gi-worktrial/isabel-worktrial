import { useQuery } from "@tanstack/react-query";

import { StatusPill } from "#/issue-view";
import { issuesQuery, runQuery } from "#/queries";
import { RunStatusTag } from "#/run-status";
import type { RecordHref } from "#src/ui/record-href";

/** A linked record's current state beside its chip in Markdown, where one read already in the cache tells it. */
export function RecordState({ record }: { record: RecordHref }) {
  switch (record.record) {
    case "issue":
      return <IssueState {...record} />;
    case "run":
      return <RunState {...record} />;
    default:
      return null;
  }
}

function IssueState({ orgId, agent, issue }: { orgId: string; agent: string; issue: string }) {
  const status = useQuery({
    ...issuesQuery({ orgId, agent }),
    select: (issues) => issues.find(({ id }) => id === issue)?.status,
  }).data;
  return status === undefined ? null : <StatusPill status={status} />;
}

function RunState({ orgId, agent, run }: { orgId: string; agent: string; run: string }) {
  const found = useQuery(runQuery({ orgId, agent, run })).data?.run;
  return found === undefined ? null : <RunStatusTag run={found} />;
}
