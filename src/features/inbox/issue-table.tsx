import { Link, useParams } from "@tanstack/react-router";
import { ListTree } from "lucide-react";

import { STATE_WORDS, SeverityMark, StateMark, StatusPill } from "#/issue-view";
import { Tag } from "#/ui/tag";
import { ISSUE_STATES, type IssueSummary } from "#src/sdk/issues";
import { ShortTimestamp } from "#src/ui/short-timestamp";

type AgentParams = { orgId: string; agent: string };

const firstSentence = (text: string) => /.*?[.!?](?=\s|$)/u.exec(text)?.[0] ?? text;

function IssueLink({ issue, params }: { issue: IssueSummary; params: AgentParams }) {
  return (
    <Link
      to="/$orgId/agents/$agent/issues/$issue"
      params={{ ...params, issue: issue.id }}
      className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2 text-ink outline-none"
    >
      <span className="flex h-6 shrink-0 items-center gap-3">
        <SeverityMark severity={issue.severity} />
        <Tag title={issue.id}>{issue.id}</Tag>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{issue.title}</span>
          {issue.status !== undefined && <StatusPill status={issue.status} />}
        </span>
        <span className="truncate type-meta-12 text-muted">{firstSentence(issue.summary)}</span>
      </span>
    </Link>
  );
}

/**
 * A compact, sectioned Inbox list: state lives in each section header instead of repeating as a table column,
 * while each Issue row keeps its direct Trace link and a two-line synopsis.
 */
export function IssueTable({ rows }: { rows: IssueSummary[] }) {
  const { orgId, agent } = useParams({ from: "/$orgId/agents/$agent/issues/" });
  const params = { orgId, agent };
  return (
    <div aria-label="Issues" className="flex flex-col gap-3">
      {ISSUE_STATES.map((state) => {
        const section = rows.filter((issue) => issue.state === state);
        if (section.length === 0) {
          return null;
        }
        return (
          <section
            key={state}
            aria-label={STATE_WORDS[state]}
            className="overflow-hidden rounded-sm border border-divider"
          >
            <header className="flex h-9 items-center gap-2 bg-subtle px-3">
              <StateMark state={state} className="size-3.5" />
              <h2 className="type-label-13 font-semibold text-ink">{STATE_WORDS[state]}</h2>
              <span className="type-meta-12 tabular-nums text-muted">{section.length}</span>
            </header>
            <ul className="divide-y divide-divider">
              {section.map((issue) => (
                <li
                  key={issue.id}
                  className="flex min-w-0 items-center bg-surface hover:bg-fill focus-within:bg-fill"
                >
                  <IssueLink issue={issue} params={params} />
                  <Link
                    to="/$orgId/agents/$agent/issues/$issue/traces"
                    params={{ ...params, issue: issue.id }}
                    aria-label={`${issue.trace_count} traces for ${issue.id}`}
                    className="relative z-10 flex h-7 shrink-0 items-center gap-1 rounded-control px-2 type-meta-12 tabular-nums text-muted hover:bg-inset hover:text-ink"
                  >
                    <ListTree className="size-3.5" />
                    {issue.trace_count}
                  </Link>
                  <span className="w-20 shrink-0 px-3 text-right type-meta-12 text-muted">
                    <ShortTimestamp at={issue.last_seen_at} relative />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
