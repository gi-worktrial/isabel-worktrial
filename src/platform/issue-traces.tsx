import { type Issue, type TracePage, canChangeTraces } from "@grounded-intelligence/grounded-sdk";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { CircleMinus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { useIssue, useIssueChange, useIssueParams } from "#/issue-view";
import { SESSION_PAGE_SIZE, issueTracesQuery } from "#/queries";
import { PageButtons } from "#/session-table";
import { OutcomeTag, issuesOf, traceTitle } from "#/trace-view";
import { Button, IconButton } from "#/ui/button";
import { Modal } from "#/ui/dialog";
import { EmptyState } from "#/ui/empty-state";
import { SearchField } from "#/ui/search-field";
import { Tag } from "#/ui/tag";
import { newestFirst } from "#src/features/traces/list";
import { Chip } from "#src/ui/chip";
import { LinesSkeleton } from "#src/ui/skeleton";
import { TabActions } from "#src/ui/tab-actions";
import { TimeTag } from "#src/ui/time-tag";

const SEARCH_LIMIT = 20;

type ListedTrace = TracePage["traces"][number];

/** The Issue's Traces a page at a time, from the page after each of `afters`, with Add Traces and Remove from Issue while they can change. */
export function IssueTraceTable({ afters }: { afters: string[] }) {
  const params = useIssueParams();
  const { orgId, agent } = params;
  const { traces: listed, next } = useSuspenseQuery(
    issueTracesQuery({ ...params, after: afters.at(-1), limit: SESSION_PAGE_SIZE }),
  ).data;
  const traces = newestFirst(listed);
  const issue = useIssue();
  const { pending, error, change } = useIssueChange();
  const editable = canChangeTraces(issue.state);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {(editable || error !== undefined) && (
        <TabActions>
          {error !== undefined && (
            <p role="alert" className="type-label-13 text-danger">
              {error}
            </p>
          )}
          {editable && (
            <AddTraces
              agent={agent}
              issue={issue}
              disabled={pending}
              onAdd={(trace) => change({ action: "include_trace", trace })}
            />
          )}
        </TabActions>
      )}
      <div className="card overflow-clip">
        <table aria-label="Traces" className="record-table">
          <thead>
            <tr>
              <th className="w-full">Message</th>
              <th>Outcome</th>
              <th className="@max-lg:hidden">Time</th>
              {editable && (
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {traces.map((trace) => (
              <tr key={trace.trace_id}>
                <td className="max-w-0 text-ink">
                  {trace.session_id === "" ? (
                    <span className="block truncate">{traceTitle(trace)}</span>
                  ) : (
                    <Link
                      to="/$orgId/agents/$agent/traces/$session/$trace"
                      params={{ orgId, agent, session: trace.session_id, trace: trace.trace_id }}
                      className="row-action block truncate"
                    >
                      {traceTitle(trace)}
                    </Link>
                  )}
                </td>
                <td>
                  <OutcomeTag annotations={trace.annotations} />
                </td>
                <td className="whitespace-nowrap @max-lg:hidden">
                  <TimeTag at={trace.started_at} />
                </td>
                {editable && (
                  <td className="row-actions">
                    <IconButton
                      label="Remove from Issue"
                      size="small"
                      disabled={pending}
                      className="relative z-10"
                      onClick={() => change({ action: "exclude_trace", trace: trace.trace_id })}
                    >
                      <CircleMinus aria-hidden="true" className="size-4" />
                    </IconButton>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {traces.length === 0 && <EmptyState title="No Traces in this Issue yet" />}
      </div>
      {(afters.length > 0 || next !== undefined) && (
        <div className="flex items-center justify-end gap-2">
          <PageButtons afters={afters} next={next} />
        </div>
      )}
    </div>
  );
}

// With no search, lists the Traces engineers removed so they can be added back.
function AddTraces({
  agent,
  issue,
  disabled,
  onAdd,
}: {
  agent: string;
  issue: Issue;
  disabled: boolean;
  onAdd(trace: string): void;
}) {
  const { client } = useRouteContext({ from: "/$orgId" });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ traces: ListedTrace[] } | { error: string }>();
  const removed = issue.exclude;
  const searching = /\S/.test(q);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!searching && removed.length === 0) {
      setFound({ traces: [] });
      return;
    }

    let current = true;
    const search = searching ? { q } : { trace: removed };
    void (async () => {
      try {
        const { traces } = await client.agents.listTraces({
          agent,
          trial: false,
          limit: SEARCH_LIMIT,
          ...search,
        });
        if (current) {
          setFound({ traces });
        }
      } catch (caught) {
        if (current) {
          setFound({ error: caught instanceof Error ? caught.message : String(caught) });
        }
      }
    })();
    return () => {
      current = false;
    };
  }, [open, client, agent, q, searching, removed]);

  return (
    <Modal
      trigger={
        <Button size="small">
          <Plus aria-hidden="true" className="size-3.5" />
          Add Traces
        </Button>
      }
      title={`Add Traces to ${issue.id}`}
      open={open}
      onOpenChange={setOpen}
      className="w-[min(560px,calc(100vw-32px))]"
    >
      <SearchField
        label="Search Traces"
        placeholder="Search by message or trace ID"
        value={q}
        onChange={setQ}
      />
      {found === undefined ? (
        <LinesSkeleton lines={4} label="Loading Traces" className="py-2" />
      ) : "error" in found ? (
        <p role="alert" className="type-label-13 text-danger">
          {found.error}
        </p>
      ) : found.traces.length === 0 ? (
        <p className="type-label-13 text-muted">
          {searching ? "No production Traces match" : "Search production Traces to add one"}
        </p>
      ) : (
        <>
          {!searching && <p className="type-label-13 text-muted">Removed from this Issue</p>}
          <ul aria-label="Traces" className="flex max-h-80 flex-col overflow-auto">
            {found.traces.map((trace) => (
              <TraceChoice
                key={trace.trace_id}
                trace={trace}
                issue={issue}
                disabled={disabled}
                onAdd={onAdd}
              />
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

function TraceChoice({
  trace,
  issue,
  disabled,
  onAdd,
}: {
  trace: ListedTrace;
  issue: Issue;
  disabled: boolean;
  onAdd(trace: string): void;
}) {
  const matched = issuesOf(trace.annotations);
  const removed = issue.exclude.includes(trace.trace_id);
  const inIssue =
    issue.include.includes(trace.trace_id) || (!removed && matched.includes(issue.id));

  return (
    <li className="flex h-9 items-center gap-2">
      <span className="min-w-0 flex-1 truncate type-label-13 text-ink">{traceTitle(trace)}</span>
      {matched
        .filter((other) => other !== issue.id)
        .map((other) => (
          <Chip key={other}>{other}</Chip>
        ))}
      <span className="type-meta-12 text-muted">
        <TimeTag at={trace.started_at} />
      </span>
      {inIssue ? (
        <Tag>In this Issue</Tag>
      ) : (
        <Button
          variant="outline"
          size="small"
          disabled={disabled}
          onClick={() => onAdd(trace.trace_id)}
        >
          {removed ? "Add back" : "Add"}
        </Button>
      )}
    </li>
  );
}
