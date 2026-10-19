// the Inbox board's lanes and cards, each lane in its state's color with a bar over it, as the Issue page's stepper
// draws its steps, and its count tinted to match, so Reviewing and Resolved read at a glance
import { ListTree } from "lucide-react";
import type { ReactNode } from "react";

import { STATE_WORDS, SeverityMark, StateMark, StatusPill, traceCount } from "#/issue-view";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import type { IssueState, IssueSummary } from "#src/sdk/issues";
import { ShortTimestamp } from "#src/ui/short-timestamp";

/** Each Issue state's Tag tone, on the board's lane counts and Activity's state changes. */
export const STATE_TONES = {
  detected: "neutral",
  reviewing: "accent",
  resolved: "success",
  dismissed: "neutral",
} as const satisfies Record<IssueState, "neutral" | "accent" | "success">;

/** A board lane: its colored bar and heading over its cards, on a tinted column. */
export function Lane({
  state,
  count,
  children,
}: {
  state: IssueState;
  count: number;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={STATE_WORDS[state]}
      className="flex h-full min-h-32 min-w-0 flex-col gap-2 overflow-hidden rounded-sm"
    >
      <h2 className="flex h-7 items-center gap-2 px-1 type-label-13 font-semibold text-ink">
        <StateMark state={state} />
        {STATE_WORDS[state]}
        <span className="type-meta-12 font-normal text-muted">
          {count} {count === 1 ? "issue" : "issues"}
        </span>
      </h2>
      {children}
    </section>
  );
}

/** A board card's body: severity, id and short time, the title, then the Traces count and status. */
export function IssueCard({ issue }: { issue: IssueSummary }) {
  return (
    <>
      <span className="flex items-center justify-between gap-2 type-meta-12 text-muted">
        <span className="flex min-w-0 items-center gap-2">
          <SeverityMark severity={issue.severity} />
          <Tag title={issue.id} className="shrink">
            <span className="truncate">{issue.id}</span>
          </Tag>
        </span>
        <ShortTimestamp at={issue.last_seen_at} relative />
      </span>
      <span className="type-copy-14 font-medium text-ink">{issue.title}</span>
      <span className="line-clamp-2 type-copy-14 text-muted">{issue.summary}</span>
      <span className="flex flex-wrap items-center gap-2 type-meta-12 text-muted">
        <Tooltip label={traceCount(issue.trace_count)}>
          <span className="flex items-center gap-1 tabular-nums">
            <ListTree aria-hidden="true" className="size-3.5" />
            <span aria-hidden="true">{issue.trace_count}</span>
            <span className="sr-only">{traceCount(issue.trace_count)}</span>
          </span>
        </Tooltip>
        {issue.status !== undefined && (
          <span className="ml-auto">
            <StatusPill status={issue.status} />
          </span>
        )}
      </span>
    </>
  );
}
