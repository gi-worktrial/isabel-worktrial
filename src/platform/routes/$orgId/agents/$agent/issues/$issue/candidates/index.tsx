import { useSuspenseQuery } from "@tanstack/react-query";
import { candidatesQuery, useAgentRepo } from "#/queries";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useTransition } from "react";

import { useIssue } from "../../../../../../../issue-view";
import { CandidateStatusTag } from "#/candidate-results";
import { Button } from "#/ui/button";
import { ConfirmDialog } from "#/ui/dialog";
import { EmptyState } from "#/ui/empty-state";
import { Input } from "#/ui/input";
import { Tag } from "#/ui/tag";
import { BranchSwatch, useBranchTones } from "#src/features/candidates/branches";
import { CompareLink } from "#src/features/candidates/candidate-compare";
import { CandidateProofs } from "#src/features/candidates/proofs-view";
import { TabActions } from "#src/ui/tab-actions";

export const Route = createFileRoute("/$orgId/agents/$agent/issues/$issue/candidates/")({
  loader: async ({ context: { queryClient }, params }) => {
    const candidates = await queryClient.ensureQueryData(candidatesQuery(params));
    const first = candidates[0];
    if (first !== undefined) {
      throw redirect({
        to: "/$orgId/agents/$agent/issues/$issue/candidates/$candidate",
        params: { ...params, candidate: first.id },
        replace: true,
      });
    }
    return candidates;
  },
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
      <CandidateTable />
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

function CandidateTable() {
  const params = Route.useParams();
  const candidates = useSuspenseQuery(candidatesQuery(params)).data;
  const { tones } = useBranchTones();

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

  return (
    <div className="card overflow-clip">
      <table aria-label="Candidates" className="record-table">
        <thead>
          <tr>
            <th className="w-full">Candidate</th>
            <th>Status</th>
            <th className="@max-lg:hidden">Evals</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr key={candidate.id}>
              <td className="max-w-0 text-ink">
                <Link
                  to="/$orgId/agents/$agent/issues/$issue/candidates/$candidate"
                  params={{ ...params, candidate: candidate.id }}
                  className="row-action flex items-center gap-2"
                >
                  <BranchSwatch tone={tones.get(candidate.id)} />
                  <span className="truncate">{candidate.title}</span>
                  {candidate.recommended !== undefined && (
                    <Tag tone="accent" title={candidate.recommended} className="relative z-2">
                      Recommended
                    </Tag>
                  )}
                </Link>
              </td>
              <td>
                <CandidateStatusTag candidate={candidate} />
              </td>
              <td className="@max-lg:hidden">
                <CandidateProofs candidate={candidate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
