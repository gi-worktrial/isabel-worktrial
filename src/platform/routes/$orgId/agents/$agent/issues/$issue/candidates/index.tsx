import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { candidateQuery, candidatesQuery, useAgentRepo } from "#/queries";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, useTransition } from "react";

import { useIssue } from "../../../../../../../issue-view";
import { CandidateResultTags } from "#/candidate-results";
import { Button, buttonVariants } from "#/ui/button";
import { ConfirmDialog } from "#/ui/dialog";
import { EmptyState } from "#/ui/empty-state";
import { Input } from "#/ui/input";
import { Markdown } from "#/ui/markdown";
import { Tag } from "#/ui/tag";
import { CandidateBranch } from "#src/features/candidates/branches";
import { splitApplyPrompt } from "#src/features/candidates/candidate-body";
import { CompareLink } from "#src/features/candidates/candidate-compare";
import { totalLines } from "#src/features/candidates/file-fold";
import type { CandidateSummary } from "#src/sdk/index";
import { LineCounts } from "#src/ui/file-name";
import { TabActions } from "#src/ui/tab-actions";

export const Route = createFileRoute("/$orgId/agents/$agent/issues/$issue/candidates/")({
  loader: ({ context: { queryClient }, params }) =>
    queryClient.ensureQueryData(candidatesQuery(params)),
  component: IssueCandidates,
});

function IssueCandidates() {
  const { state } = useIssue();

  return (
    <div className="flex flex-col gap-3">
      <TabActions>
        {state === "reviewing" && <NewCandidateDialog />}
      </TabActions>
      <CandidateCards />
    </div>
  );
}

function NewCandidateDialog() {
  const { client } = Route.useRouteContext();
  const params = Route.useParams();
  const repo = useAgentRepo(params);
  const navigate = Route.useNavigate();
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function create() {
    startTransition(async () => {
      try {
        const candidate = await client.issues.createCandidate({
          repo,
          id: params.issue,
          title,
        });
        await navigate({
          to: "/$orgId/agents/$agent/issues/$issue/debug/candidates/$candidate",
          params: { ...params, candidate },
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {error !== undefined && (
        <p role="alert" className="min-w-0 flex-1 text-right type-label-13 text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        trigger={<Button disabled={pending}>New Candidate</Button>}
        title="New Candidate"
        confirmLabel="Create"
        blocked={title.trim() === ""}
        onConfirm={create}
      >
        <Input
          aria-label="Title"
          autoFocus
          placeholder="e.g. Parse dates in the user's locale"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}

function CandidateCards() {
  const candidates = useSuspenseQuery(candidatesQuery(Route.useParams())).data;
  const [expanded, setExpanded] = useState(false);

  if (candidates.length === 0) {
    return (
      <div className="card overflow-clip">
        <EmptyState
          title="No Candidates yet"
          description="Candidates show here once a fix is proposed for this Issue."
        />
      </div>
    );
  }

  const remaining = candidates.length - 1;
  const shown = expanded ? candidates : candidates.slice(0, 1);

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label="Candidates" className="flex flex-col gap-2">
        {shown.map((candidate) => (
          <CandidateCard key={candidate.id} candidate={candidate} />
        ))}
      </ul>
      {remaining > 0 && (
        <div className="flex items-center justify-between gap-3">
          <Button variant="quiet" size="small" onClick={() => setExpanded((current) => !current)}>
            {expanded
              ? "Show fewer candidates"
              : `View ${remaining} more candidate${remaining === 1 ? "" : "s"}`}
          </Button>
          <CompareLink />
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
}: {
  candidate: CandidateSummary;
}) {
  const params = Route.useParams();
  const detail = useQuery(candidateQuery({ ...params, candidate: candidate.id })).data;
  const { rationale } = splitApplyPrompt(candidate.body);

  return (
    <li>
      <Link
        to="/$orgId/agents/$agent/issues/$issue/candidates/$candidate"
        params={{ ...params, candidate: candidate.id }}
        className="flex min-w-0 flex-col gap-3 card p-4 no-underline hover:border-divider-strong"
      >
        <header className="flex min-w-0 items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate type-label-13 font-semibold text-ink">{candidate.title}</span>
              {candidate.recommended !== undefined && (
                <Tag tone="accent" title={candidate.recommended}>
                  Recommended
                </Tag>
              )}
            </span>
            {rationale !== "" && (
              <Markdown text={rationale} mdx className="line-clamp-2 text-muted" />
            )}
          </div>
          <span className={buttonVariants({ variant: "primary", size: "small" })}>
            View candidate
          </span>
        </header>
        <footer className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <CandidateBranch candidate={candidate} />
            {detail !== undefined && (
              <Tag className="gap-2">
                <span className="font-normal text-muted">
                  {detail.files.length === 1 ? "1 file" : `${detail.files.length} files`}
                </span>
                <LineCounts {...totalLines(detail.files)} className="type-mono-12" />
              </Tag>
            )}
          </span>
          <span className="flex items-center">
            <CandidateResultTags results={candidate.results} />
          </span>
        </footer>
      </Link>
    </li>
  );
}
