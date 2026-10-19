import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { candidateQuery, candidatesQuery, useAgentRepo } from "#/queries";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useTransition } from "react";

import { useIssue } from "../../../../../../../issue-view";
import { CandidateResultTags } from "#/candidate-results";
import { Button, IconButton, buttonVariants } from "#/ui/button";
import { ConfirmDialog } from "#/ui/dialog";
import { EmptyState } from "#/ui/empty-state";
import { Input } from "#/ui/input";
import { Markdown } from "#/ui/markdown";
import { Tag } from "#/ui/tag";
import { CandidateBranch } from "#src/features/candidates/branches";
import { splitApplyPrompt } from "#src/features/candidates/candidate-body";
import { CompareLink } from "#src/features/candidates/candidate-compare";
import { totalLines } from "#src/features/candidates/file-fold";
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
        <CompareLink />
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
  const params = Route.useParams();
  const candidates = useSuspenseQuery(candidatesQuery(params)).data;
  const [index, setIndex] = useState(0);
  const selected = candidates[Math.min(index, candidates.length - 1)];
  const detail = useQuery({
    ...candidateQuery({ ...params, candidate: selected?.id ?? "" }),
    enabled: selected !== undefined,
  }).data;

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

  const candidate = selected!;
  const { rationale } = splitApplyPrompt(candidate.body);

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Candidate pagination"
        className="flex items-center justify-between gap-3"
      >
        <h3 className="type-heading-15 text-ink">
          {candidates.length === 1 ? "Proposed fix" : "Proposed fixes"}
        </h3>
        <span className="flex items-center gap-2">
          <IconButton
            label="Previous candidate"
            size="small"
            disabled={index === 0}
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
          >
            <ChevronLeft className="size-4" />
          </IconButton>
          <span className="type-meta-12 whitespace-nowrap text-muted tabular-nums">
            {index + 1} of {candidates.length}
          </span>
          <IconButton
            label="Next candidate"
            size="small"
            disabled={index === candidates.length - 1}
            onClick={() => setIndex((current) => Math.min(candidates.length - 1, current + 1))}
          >
            <ChevronRight className="size-4" />
          </IconButton>
        </span>
      </div>
      <ul aria-label="Candidates">
        <li key={candidate.id} className="flex min-w-0 flex-col gap-3 card p-4">
          <header className="flex min-w-0 items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <Link
                  to="/$orgId/agents/$agent/issues/$issue/candidates/$candidate"
                  params={{ ...params, candidate: candidate.id }}
                  className="truncate type-label-13 font-semibold text-ink hover:underline"
                >
                  {candidate.title}
                </Link>
                <CandidateBranch candidate={candidate} />
                <CandidateResultTags results={candidate.results} />
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
            <Link
              to="/$orgId/agents/$agent/issues/$issue/candidates/$candidate"
              params={{ ...params, candidate: candidate.id }}
              className={buttonVariants({ variant: "primary", size: "small" })}
            >
              View candidate
            </Link>
          </header>
          {detail !== undefined && (
            <Tag className="self-start gap-2">
              <span>Fix</span>
              <span className="font-normal text-muted">
                {detail.files.length === 1 ? "1 file" : `${detail.files.length} files`}
              </span>
              <LineCounts {...totalLines(detail.files)} className="type-mono-12" />
            </Tag>
          )}
        </li>
      </ul>
    </div>
  );
}
