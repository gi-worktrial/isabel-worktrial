import { useSuspenseQuery } from "@tanstack/react-query";
import { type Candidate, canApprove } from "@grounded-intelligence/grounded-sdk";
import { Link, createFileRoute } from "@tanstack/react-router";

import { CandidateActions, CandidateNotFound } from "#/candidate-results";
import { debugSearchSchema } from "#/debug-search";
import { DebugViews } from "#/debug-views";
import { useIssue, useIssueChange, useStartIssueWork } from "#/issue-view";
import {
  SESSION_PAGE_SIZE,
  candidateQuery,
  issueQuery,
  issueTracesQuery,
} from "#/queries";
import { buttonVariants } from "#/ui/button";
import { Tag } from "#/ui/tag";
import { crumbs } from "#/crumbs";
import { ShipDialog } from "#src/features/candidates/approval";
import { CandidateBranch } from "#src/features/candidates/branches";
import {
  CandidateActionsEnd,
  CandidateBody,
  FixCard,
  debugVariant,
} from "#src/features/candidates/candidate-page";
import { CandidateGrades } from "#src/features/debug/eval-grades";

export const Route = createFileRoute(
  "/$orgId/agents/$agent/issues/$issue_/candidates/$candidate",
)({
  staticData: { rail: true },
  validateSearch: debugSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, params, deps }) => {
    const [candidate, issue] = await Promise.all([
      queryClient.ensureQueryData(candidateQuery(params)),
      queryClient.ensureQueryData(issueQuery(params)),
      deps.view === "traces" &&
        queryClient.ensureQueryData(
          issueTracesQuery({ ...params, after: deps.afters?.at(-1), limit: SESSION_PAGE_SIZE }),
        ),
    ]);
    return crumbs(
      { label: "Inbox", to: "/$orgId/agents/$agent/issues" },
      { label: issue.id, to: "/$orgId/agents/$agent/issues/$issue" },
      {
        label: candidate.title,
        to: "/$orgId/agents/$agent/issues/$issue/candidates/$candidate",
      },
    );
  },
  component: CandidatePage,
  notFoundComponent: () => <CandidateNotFound />,
});

function CandidatePage() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const { orgId, agent } = params;
  const candidate = useSuspenseQuery(candidateQuery(params)).data;
  const issue = useIssue();
  const startWork = useStartIssueWork();

  return (
    <section
      aria-label={candidate.title}
      className="flex min-h-[calc(100dvh-6rem)] flex-col gap-4"
    >
      <h1 className="flex min-w-0 items-center gap-2 type-title-18 text-ink">
        <span className="min-w-0 truncate">{candidate.title}</span>
        <CandidateBranch candidate={candidate} />
        {candidate.recommended !== undefined && (
          <Tag tone="accent" title={candidate.recommended}>
            Recommended
          </Tag>
        )}
        <CandidateActionsEnd>
          <CandidateActions agent={agent} candidate={candidate} />
          <Link
            to="/$orgId/agents/$agent/issues/$issue/debug/candidates/$candidate"
            params={{ orgId, agent, issue: issue.id, candidate: candidate.id }}
            className={buttonVariants({ variant: debugVariant(issue.state, candidate.results) })}
            onClick={startWork}
          >
            Debug
          </Link>
          {canApprove(issue.state, candidate.results) && <ShipButton candidate={candidate} />}
        </CandidateActionsEnd>
      </h1>
      <CandidateBody body={candidate.body} />
      <DebugViews
        search={search}
        files={
          <div className="w-full">
            <FixCard files={candidate.files} />
          </div>
        }
        grades={<CandidateGrades candidate={candidate} />}
      />
    </section>
  );
}

function ShipButton({ candidate }: { candidate: Candidate }) {
  const { pending, error, change } = useIssueChange();

  return (
    <span className="flex items-center gap-2">
      {error !== undefined && (
        <span role="alert" className="type-label-13 font-normal text-danger">
          {error}
        </span>
      )}
      <ShipDialog
        candidate={candidate}
        variant="primary"
        disabled={pending}
        onShip={() => change({ action: "ship", candidate: candidate.id })}
      />
    </span>
  );
}
