import { useSuspenseQuery } from "@tanstack/react-query";
import { candidateQuery, candidatesQuery } from "#/queries";
import { type Candidate, canApprove } from "@grounded-intelligence/grounded-sdk";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  useIssue,
  useIssueChange,
  useStartIssueWork,
} from "../../../../../../../issue-view";
import { CandidateActions, CandidateNotFound } from "#/candidate-results";
import { IconButton, buttonVariants } from "#/ui/button";
import { Tag } from "#/ui/tag";
import { ShipDialog } from "#src/features/candidates/approval";
import { CandidateBranch } from "#src/features/candidates/branches";
import {
  CandidateActionsEnd,
  CandidateBody,
  FixCard,
  debugVariant,
} from "#src/features/candidates/candidate-page";
import { EvalResults } from "#src/features/candidates/proofs-view";
import type { CandidateSummary } from "#src/sdk/index";

export const Route = createFileRoute("/$orgId/agents/$agent/issues/$issue/candidates/$candidate")({
  loader: ({ context: { queryClient }, params }) =>
    queryClient.ensureQueryData(candidateQuery(params)),
  component: CandidatePage,
  notFoundComponent: () => <CandidateNotFound />,
});

function CandidatePage() {
  const params = Route.useParams();
  const { orgId, agent } = params;
  const candidate = useSuspenseQuery(candidateQuery(params)).data;
  const candidates = useSuspenseQuery(candidatesQuery(params)).data;
  const issue = useIssue();
  const startWork = useStartIssueWork();

  return (
    <section aria-label={candidate.title} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h2 className="flex min-w-0 items-center gap-2 type-heading-15 text-ink">
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
            {canApprove(issue.state, candidate.results) && (
              <ShipButton candidate={candidate} />
            )}
            <CandidateNavigation candidates={candidates} current={candidate.id} />
          </CandidateActionsEnd>
        </h2>
        <CandidateBody body={candidate.body}>
          <EvalResults candidate={candidate} />
        </CandidateBody>
      </div>
      <FixCard files={candidate.files} />
    </section>
  );
}

function CandidateNavigation({
  candidates,
  current,
}: {
  candidates: readonly CandidateSummary[];
  current: string;
}) {
  const navigate = Route.useNavigate();
  const params = Route.useParams();
  const index = candidates.findIndex(({ id }) => id === current);
  const previous = index > 0 ? candidates[index - 1] : undefined;
  const next = index >= 0 ? candidates[index + 1] : undefined;
  const open = (candidate: CandidateSummary | undefined) => {
    if (candidate !== undefined) {
      void navigate({
        to: "/$orgId/agents/$agent/issues/$issue/candidates/$candidate",
        params: { ...params, candidate: candidate.id },
      });
    }
  };

  return (
    <>
      <IconButton
        label="Previous candidate"
        size="small"
        disabled={previous === undefined}
        onClick={() => open(previous)}
      >
        <ChevronLeft className="size-4" />
      </IconButton>
      <span className="type-meta-12 whitespace-nowrap text-muted tabular-nums">
        {index + 1} of {candidates.length}
      </span>
      <IconButton
        label="Next candidate"
        size="small"
        disabled={next === undefined}
        onClick={() => open(next)}
      >
        <ChevronRight className="size-4" />
      </IconButton>
    </>
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
