import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  type IssueParams,
  candidatesQuery,
  issueEvalsQuery,
  issueEventsQuery,
  issueQuery,
} from "#/queries";
import { canShip, getIssueActions, type Issue } from "@grounded-intelligence/grounded-sdk";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { ChevronDown, History } from "lucide-react";
import { type ReactNode, useState } from "react";

import { usePebbleDock, usePebblePage } from "#/pebble/page";
import {
  ACTION_WORDS,
  APPROVAL_OUTDATED,
  SEVERITY_WORDS,
  STATE_WORDS,
  SeverityMark,
  StateMark,
  StatusPill,
  useIssue,
  useIssueChange,
} from "../../../../../issue-view";
import { Button, IconButton } from "#/ui/button";
import { ConfirmDialog } from "#/ui/dialog";
import { Fact, Facts } from "#/ui/facts";
import { Textarea } from "#/ui/input";
import { Markdown } from "#/ui/markdown";
import { Dropdown, MenuItem } from "#/ui/menu";
import { Tab, Tabs } from "#/ui/tabs";
import { Tag } from "#/ui/tag";
import { Timestamp } from "#/ui/timestamp";
import { crumbs } from "#/crumbs";
import { Count } from "#src/ui/count";
import { TabActionsEnd } from "#src/ui/tab-actions";

const ISSUE_PROMPTS = [
  "Summarize this Issue",
  "Which Traces show this Issue most clearly?",
  "What might be causing this?",
];
const TAB_COUNT =
  "group-aria-[current=page]/tab:bg-divider group-aria-[current=page]/tab:text-ink";

export const Route = createFileRoute("/$orgId/agents/$agent/issues/$issue")({
  staticData: { rail: true },
  loader: async ({ context: { queryClient }, params }) => {
    const issue = await queryClient.ensureQueryData(issueQuery(params));
    await Promise.all([
      queryClient.ensureQueryData(candidatesQuery(params)),
      queryClient.ensureQueryData(issueEvalsQuery(params)),
      queryClient.ensureQueryData(issueEventsQuery(params)),
    ]);
    return crumbs(
      { label: "Inbox", to: "/$orgId/agents/$agent/issues" },
      { label: issue.id, to: "/$orgId/agents/$agent/issues/$issue" },
    );
  },
  component: IssuePage,
});

function IssuePage() {
  const { orgId, agent } = Route.useParams();
  const issue = useIssue();
  const params = { orgId, agent, issue: issue.id };
  const lastEdited = useSuspenseQuery(issueEventsQuery(params)).data.events[0]?.at;
  const { openActivity } = usePebbleDock();
  const approved = useQuery({
    ...candidatesQuery(params),
    enabled: issue.approved !== undefined,
  }).data?.find(({ id }) => id === issue.approved?.candidate);
  usePebblePage(
    `The engineer is viewing Issue ${issue.id}, "${issue.title}" (${issue.state}). Its file is issues/${issue.id}/issue.mdx, at commit ${issue.head_oid} on main.`,
    ISSUE_PROMPTS,
  );

  return (
    <article aria-label="Issue" className="flex min-w-0 flex-1 flex-col gap-4">
      <header className="flex flex-col gap-3 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="flex min-w-0 flex-1 basis-64 flex-col items-start gap-1 type-title-18 text-ink">
            <span className="type-label-13 font-normal text-muted">{issue.id}</span>
            <span className="w-full min-w-0 truncate" title={issue.title}>
              {issue.title}
            </span>
          </h1>
          <StatusPill status={issue.status} />
          <IssueActions issue={issue} />
        </div>
        <Facts label="Issue details" className="items-start">
          <Fact label="State" orientation="vertical">
            <StateMark state={issue.state} className="size-3.5" />
            {STATE_WORDS[issue.state]}
          </Fact>
          {issue.approved !== undefined && (
            <Fact label="Approved" orientation="vertical">
              <Link
                to="/$orgId/agents/$agent/issues/$issue/candidates/$candidate"
                params={{ ...params, candidate: issue.approved.candidate }}
                title={issue.approved.candidate}
                className="min-w-0 truncate rounded-xs text-accent-ink hover:underline"
              >
                {approved?.title ?? issue.approved.candidate}
              </Link>
              {issue.approved.outdated && <Tag tone="warning">{APPROVAL_OUTDATED}</Tag>}
            </Fact>
          )}
          {issue.fix !== undefined && (
            <Fact label="Fix" orientation="vertical">
              <Tag title={issue.fix}>{issue.fix.slice(0, 7)}</Tag>
            </Fact>
          )}
          <Fact label="Severity" orientation="vertical">
            <SeverityMark severity={issue.severity} />
            {SEVERITY_WORDS[issue.severity]}
          </Fact>
          <Fact label="First seen" orientation="vertical">
            <Timestamp at={issue.first_seen_at} />
          </Fact>
          {lastEdited !== undefined && (
            <Fact label="Last edited" orientation="vertical">
              <span className="flex items-center">
                <Timestamp at={lastEdited} />
                <IconButton
                  label="View full issue history"
                  size="small"
                  className="-my-1 -ml-1"
                  onClick={() => openActivity(params)}
                >
                  <History aria-hidden="true" className="size-3.5 text-muted" />
                </IconButton>
              </span>
            </Fact>
          )}
        </Facts>
        {issue.dismissal_reason !== undefined && (
          <p className="type-meta-12 text-muted">
            <span className="font-medium">Dismissed because</span> {issue.dismissal_reason}
          </p>
        )}
        {issue.body.trim() !== "" && (
          <IssueOverview key={issue.id} text={issue.body} />
        )}
      </header>
      <section aria-label="Issue workspace" className="flex flex-col gap-4">
        <Tabs label="Issue sections">
          {issue.state === "detected" || issue.state === "reviewing" ? (
            <>
              <CandidatesTab params={params} />
              <EvalsTab params={params} />
            </>
          ) : (
            <ClosedTabs params={params} />
          )}
          <Tab to="/$orgId/agents/$agent/issues/$issue/traces" params={params}>
            Traces <Count className={TAB_COUNT}>{issue.trace_count}</Count>
          </Tab>
          <TabActionsEnd />
        </Tabs>
        <Outlet />
      </section>
    </article>
  );
}

function IssueOverview({ text }: { text: string }) {
  return (
    <section aria-label="Issue overview">
      <Markdown text={text} mdx className="" />
    </section>
  );
}

function EvalsTab({ params }: { params: IssueParams }) {
  const evals = useSuspenseQuery(issueEvalsQuery(params)).data;

  return (
    <Tab to="/$orgId/agents/$agent/issues/$issue/evals" params={params}>
      Evals <Count className={TAB_COUNT}>{evals?.length ?? 0}</Count>
    </Tab>
  );
}

function CandidatesTab({ params }: { params: IssueParams }) {
  const candidates = useSuspenseQuery(candidatesQuery(params)).data;

  return (
    <Tab to="/$orgId/agents/$agent/issues/$issue/candidates" params={params}>
      Candidates <Count className={TAB_COUNT}>{candidates.length}</Count>
    </Tab>
  );
}

// A resolved or dismissed Issue keeps only the tabs that have something in them.
function ClosedTabs({ params }: { params: IssueParams }) {
  const evals = useSuspenseQuery(issueEvalsQuery(params)).data;
  const candidates = useSuspenseQuery(candidatesQuery(params)).data;

  return (
    <>
      {candidates.length > 0 && <CandidatesTab params={params} />}
      {evals !== null && evals.length > 0 && <EvalsTab params={params} />}
    </>
  );
}

function IssueActions({ issue }: { issue: Issue }) {
  const { pending, error, change: run } = useIssueChange();
  const params = Route.useParams();
  const actions = getIssueActions(issue.state);
  const { openActivity } = usePebbleDock();

  return (
    <div
      role="group"
      aria-label="Issue actions"
      className="flex flex-wrap items-center justify-end gap-2"
    >
      {error !== undefined && (
        <p role="alert" className="w-full text-right type-label-13 text-danger">
          {error}
        </p>
      )}
      <Dropdown
        align="end"
        trigger={
          <Button variant="secondary" size="small">
            Actions
            <ChevronDown className="size-3.5" />
          </Button>
        }
      >
        {actions.includes("validate") && (
          <MenuItem disabled={pending} onSelect={() => run({ action: "validate" })}>
            Start work
          </MenuItem>
        )}
        {actions.includes("reset") && (
          <MenuItem disabled={pending} onSelect={() => run({ action: "reset" })}>
            Move back to New
          </MenuItem>
        )}
        {issue.state === "reviewing" &&
          issue.approved !== undefined &&
          (canShip(issue) ? (
            <ShipDialog
              candidate={issue.approved.candidate}
              trigger={<MenuItem>Mark as shipped</MenuItem>}
              onShip={() => run({ action: "ship" })}
            />
          ) : (
            <MenuItem disabled title={APPROVAL_OUTDATED}>
              Mark as shipped
            </MenuItem>
          ))}
        {actions.includes("dismiss") && (
          <DismissDialog
            id={issue.id}
            trigger={<MenuItem disabled={pending}>Dismiss issue</MenuItem>}
            onDismiss={(reason) => run({ action: "dismiss", reason })}
          />
        )}
        <MenuItem onSelect={() => openActivity(params)}>View activity</MenuItem>
      </Dropdown>
    </div>
  );
}

function ShipDialog({
  candidate,
  trigger,
  onShip,
}: {
  candidate: string;
  trigger: ReactNode;
  onShip(): void;
}) {
  return (
    <ConfirmDialog
      trigger={trigger}
      title="Mark as shipped"
      confirmLabel="Mark as shipped"
      onConfirm={onShip}
    >
      <p className="type-copy-14 text-muted">
        Merges {candidate} and this Issue's Evals into main, then resolves the Issue.
      </p>
    </ConfirmDialog>
  );
}

function DismissDialog({
  id,
  trigger,
  onDismiss,
}: {
  id: string;
  trigger: ReactNode;
  onDismiss(reason: string): void;
}) {
  const [reason, setReason] = useState("");

  return (
    <ConfirmDialog
      trigger={trigger}
      title={`Dismiss ${id}`}
      confirmLabel={ACTION_WORDS.dismiss}
      blocked={reason.trim() === ""}
      onConfirm={() => onDismiss(reason)}
    >
      <Textarea
        aria-label="Reason"
        rows={3}
        autoFocus
        placeholder="e.g. Fixed in our next release"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
    </ConfirmDialog>
  );
}
