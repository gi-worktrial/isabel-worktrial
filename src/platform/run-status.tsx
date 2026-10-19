import type { JobRun } from "@grounded-intelligence/grounded-sdk";

import { Tag } from "#/ui/tag";

export function RunStatusTag({ run }: { run: JobRun }) {
  if (run.status === "queued") {
    return <Tag>Queued</Tag>;
  }
  if (run.status === "in_progress") {
    return (
      <Tag tone="accent">{run.cancel_requested_at === null ? "Running" : "Cancelling"}</Tag>
    );
  }

  return run.conclusion === "success" ? (
    <Tag tone="success">Succeeded</Tag>
  ) : (
    <Tag tone="danger">{run.conclusion === "cancelled" ? "Cancelled" : "Failed"}</Tag>
  );
}
