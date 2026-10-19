// the Overview's cards under the Issue's prose: Review asks which Candidate fixes it (the Candidates, their Evals,
// then the Traces), and Deploy leads with the approved Candidate; each card on a tab opens it. They read what the
// Issue page already loads plus the Traces tab's first page
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, X } from "lucide-react";
import type { ReactNode } from "react";

import { CandidateStatusTag } from "#/candidate-results";
import { useIssue, useIssueParams } from "#/issue-view";
import {
  type IssueParams,
  SESSION_PAGE_SIZE,
  candidatesQuery,
  issueEvalsQuery,
  issueTracesQuery,
} from "#/queries";
import { traceTitle } from "#/trace-view";
import { Button, buttonVariants } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Skeleton } from "#/ui/skeleton";
import { Timestamp } from "#/ui/timestamp";
import { Tooltip } from "#/ui/tooltip";
import { needsDebug } from "#src/features/candidates/proofs";
import {
  type CandidateSummary,
  type EvalTally,
  FAIL_LABEL,
  type Issue,
  type TracePage,
  getCandidateStatus,
} from "#src/sdk/index";
import { Chip } from "#src/ui/chip";
import { Count } from "#src/ui/count";
import { errorMessage } from "#src/ui/format-extra";
import { NotRun } from "#src/ui/result-tag";

// the Candidates card lists this many, the rest one click away on the tab
const LISTED_CANDIDATES = 3;

/** The Overview's cards for the Issue's phase. */
export function IssueAtAGlance() {
  const issue = useIssue();
  const params = useIssueParams();

  return (
    <section aria-label="At a glance" className="@container">
      <div className="grid gap-4 @2xl:grid-cols-3">
        <FixCards issue={issue} params={params} />
        <TracesCard issue={issue} params={params} />
      </div>
    </section>
  );
}

const passing = ({ results }: CandidateSummary) => results?.new_evals?.passed ?? -1;

// the approved Candidate, else the only or the recommended one, else in review the one passing the most New Evals
const leadOf = (issue: Issue, candidates: readonly CandidateSummary[]) =>
  candidates.find(({ id }) => id === issue.approved?.candidate) ??
  (candidates.length === 1
    ? candidates[0]
    : candidates.find(({ recommended }) => recommended !== undefined)) ??
  (issue.state === "detected" || issue.state === "reviewing"
    ? candidates.toSorted((a, b) => passing(b) - passing(a))[0]
    : undefined);

// Review's Candidates and Evals, the approved Candidate alone in Deploy; a closed Issue keeps the cards with something
// in them, as its tabs do
function FixCards({ issue, params }: { issue: Issue; params: IssueParams }) {
  const candidates = useSuspenseQuery(candidatesQuery(params)).data;
  const evals = useSuspenseQuery(issueEvalsQuery(params)).data ?? [];
  const open = issue.state === "detected" || issue.state === "reviewing";
  const lead = leadOf(issue, candidates);
  const approved = candidates.filter(({ id }) => id === issue.approved?.candidate);
  const listed =
    approved.length > 0
      ? approved
      : [...(lead === undefined ? [] : [lead]), ...candidates.filter((other) => other !== lead)];
  // no Candidate fixes it yet, so Debug is the way forward
  const stuck =
    open &&
    approved.length === 0 &&
    candidates.length > 0 &&
    candidates.every(({ results }) => needsDebug(getCandidateStatus(issue.state, results)));

  return (
    <>
      {(open || candidates.length > 0) && (
        <GlanceCard tab="Candidates" count={candidates.length} params={params}>
          {listed.length === 0 ? (
            <Note>No Candidates yet</Note>
          ) : (
            <ul aria-label="Candidates" className="flex flex-col gap-2">
              {listed.slice(0, LISTED_CANDIDATES).map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex h-6 min-w-0 items-center justify-between gap-2"
                >
                  <CandidateChip candidate={candidate} params={params} />
                  <CandidateStatusTag candidate={candidate} />
                </li>
              ))}
            </ul>
          )}
          {stuck && lead !== undefined && (
            <p className="flex h-7 items-center gap-3 type-label-13 text-muted">
              No Candidate passes its Evals yet
              <Tooltip label={`Open ${lead.title} in Debug`}>
                <Link
                  to="/$orgId/agents/$agent/issues/$issue/debug/candidates/$candidate"
                  params={{ ...params, candidate: lead.id }}
                  className={cn(buttonVariants({ size: "small" }), "relative z-10")}
                >
                  Debug
                </Link>
              </Tooltip>
            </p>
          )}
        </GlanceCard>
      )}
      {(open || evals.length > 0) && (
        <GlanceCard tab="Evals" count={evals.length} params={params}>
          {evals.length === 0 ? (
            <Note>No Evals reproduce this Issue yet</Note>
          ) : issue.state === "resolved" && lead === undefined ? (
            <Note>Merged into main with the Fix</Note>
          ) : (
            <Rows>
              <Row label="New">
                <Tally tally={lead?.results?.new_evals} on={lead?.title} />
              </Row>
              <Row label="Existing">
                <Tally tally={lead?.results?.existing_evals} on={lead?.title} />
              </Row>
            </Rows>
          )}
        </GlanceCard>
      )}
    </>
  );
}

function CandidateChip({
  candidate,
  params,
}: {
  candidate: CandidateSummary;
  params: IssueParams;
}) {
  return (
    <Chip asChild kind="candidates" className="relative z-10 shrink">
      <Link
        to="/$orgId/agents/$agent/issues/$issue/candidates/$candidate"
        params={{ ...params, candidate: candidate.id }}
        title={candidate.title}
      >
        <span className="min-w-0 truncate">{candidate.title}</span>
      </Link>
    </Chip>
  );
}

type ListedTrace = TracePage["traces"][number];

const failures = ({ annotations }: ListedTrace) =>
  annotations.filter(({ label }) => label === FAIL_LABEL).length;

// the Trace that fails the most criteria shows the Issue most clearly, the newest of those first
const clearest = (traces: readonly ListedTrace[]) =>
  traces.toSorted(
    (a, b) => failures(b) - failures(a) || Date.parse(b.started_at) - Date.parse(a.started_at),
  )[0];

// the Traces tab's first page, so opening the tab after reads nothing new
const useFirstPage = (params: IssueParams) =>
  useQuery(issueTracesQuery({ ...params, after: undefined, limit: SESSION_PAGE_SIZE }));

function TracesCard({ issue, params }: { issue: Issue; params: IssueParams }) {
  const read = useFirstPage(params);
  const trace = read.data === undefined ? undefined : clearest(read.data.traces);

  return (
    <GlanceCard tab="Traces" count={issue.trace_count} params={params}>
      {issue.trace_count === 0 ? (
        <Note>No Traces in this Issue yet</Note>
      ) : (
        <Rows>
          <Row label="Newest">
            <Timestamp at={issue.last_seen_at} />
          </Row>
          <Row label="Clearest">
            <FirstPage read={read} label="the clearest Trace">
              {trace === undefined ? (
                <span className="text-muted">None listed</span>
              ) : (
                <TraceChip trace={trace} params={params} />
              )}
            </FirstPage>
          </Row>
        </Rows>
      )}
    </GlanceCard>
  );
}

// a value read from the Traces tab's first page: a skeleton while it loads, Retry when it failed
function FirstPage({
  read,
  label,
  children,
}: {
  read: ReturnType<typeof useFirstPage>;
  label: string;
  children: ReactNode;
}) {
  if (read.error !== null) {
    return (
      <Tooltip label={errorMessage(read.error)}>
        <Button size="small" className="relative z-10" onClick={() => void read.refetch()}>
          Retry
        </Button>
      </Tooltip>
    );
  }
  if (read.data === undefined) {
    return <Skeleton role="status" aria-label={`Loading ${label}`} className="h-3 w-32" />;
  }
  return children;
}

function TraceChip({ trace, params }: { trace: ListedTrace; params: IssueParams }) {
  const title = traceTitle(trace);
  // a Trace outside a session has no page, as on the Traces tab
  if (trace.session_id === "") {
    return (
      <Chip kind="traces" title={title}>
        {title}
      </Chip>
    );
  }

  return (
    <Chip asChild kind="traces" className="relative z-10">
      <Link
        to="/$orgId/agents/$agent/traces/$session/$trace"
        params={{
          orgId: params.orgId,
          agent: params.agent,
          session: trace.session_id,
          trace: trace.trace_id,
        }}
        title={title}
      >
        <span className="min-w-0 truncate">{title}</span>
      </Link>
    </Chip>
  );
}

// how many of the lead Candidate's Evals pass in its newest run: grey with a check when all do, red when one fails
function Tally({ tally, on }: { tally: EvalTally | undefined; on: string | undefined }) {
  if (tally === undefined || on === undefined) {
    return <NotRun />;
  }

  const passed = tally.passed === tally.total;
  const Mark = passed ? Check : X;
  return (
    <Tooltip label={`${tally.passed} of ${tally.total} pass on ${on}`}>
      <span
        className={cn(
          "relative z-10 flex items-center gap-1 tabular-nums",
          passed ? "text-ink" : "text-danger",
        )}
      >
        <Mark aria-hidden="true" className={cn("size-3.5", passed && "text-muted")} />
        {tally.passed}/{tally.total}
      </span>
    </Tooltip>
  );
}

const TABS = {
  Candidates: "/$orgId/agents/$agent/issues/$issue/candidates",
  Evals: "/$orgId/agents/$agent/issues/$issue/evals",
  Traces: "/$orgId/agents/$agent/issues/$issue/traces",
} as const;

// a card the whole of which opens its tab, its own links and tooltips above that
function GlanceCard({
  tab,
  count,
  params,
  children,
}: {
  tab: keyof typeof TABS;
  count: number;
  params: IssueParams;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-w-0 flex-col gap-2 card p-3 hover:bg-subtle motion-safe:transition-colors">
      <Link
        to={TABS[tab]}
        params={params}
        className="row-action flex h-6 items-center gap-2 type-label-13 font-medium text-ink after:rounded-sm"
      >
        {tab}
        <Count>{count}</Count>
        <ChevronRight aria-hidden="true" className="ml-auto size-3.5 text-muted" />
      </Link>
      {children}
    </div>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2">{children}</dl>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="type-meta-12 font-medium text-muted">{label}</dt>
      <dd className="flex h-6 min-w-0 items-center type-label-13 text-ink">{children}</dd>
    </>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="flex h-6 items-center type-label-13 text-muted">{children}</p>;
}
