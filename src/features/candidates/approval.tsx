import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

import { CandidateActions } from "#/candidate-results";
import { useIssue, useIssueChange, useIssueParams } from "#/issue-view";
import { Button } from "#/ui/button";
import { CandidateBranch } from "#src/features/candidates/branches";
import type { Proof } from "#src/features/candidates/proofs";
import { ProofList, ProofsLoader, RunChange } from "#src/features/candidates/proofs-view";
import { type Candidate, type CandidateSummary, canApprove } from "#src/sdk/issues";
import { Chip } from "#src/ui/chip";
import { ConfirmDialog } from "#src/ui/confirm-dialog";

const short = (sha: string) => sha.slice(0, 7);

function Rows({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-sm bg-fill p-3">
      {children}
    </dl>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="type-meta-12 font-medium text-muted">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2 type-label-13 text-ink">
        {children}
      </dd>
    </>
  );
}

type IssueParams = { orgId: string; agent: string; issue: string };

// what fixes a proof that doesn't hold, in place: Debug Evals for the Evals, Debug for the fix
function remedy(
  proof: Proof,
  candidate: CandidateSummary,
  debugging: boolean,
  params: IssueParams,
): ReactNode {
  if (proof.kind === "reproduction" && proof.status !== "running") {
    return (
      <Button size="small" asChild>
        <Link to="/$orgId/agents/$agent/issues/$issue/debug/evals" params={params}>
          Debug Evals
        </Link>
      </Button>
    );
  }
  if ((proof.kind === "fix" || proof.kind === "safety") && proof.status === "fail" && !debugging) {
    return (
      <Button size="small" asChild>
        <Link
          to="/$orgId/agents/$agent/issues/$issue/debug/candidates/$candidate"
          params={{ ...params, candidate: candidate.id }}
        >
          Debug
        </Link>
      </Button>
    );
  }
  return undefined;
}

/**
 * Platform's Approve, confirmed like a pull request approval: the four proofs with what fixes each one that doesn't
 * hold, then what is approved at which test merge. Platform's `canApprove` decides whether it can be confirmed, and
 * `onApprove` is platform's approve.
 */
export function ApproveDialog({
  candidate,
  variant,
  disabled,
  debugging = false,
  onApprove,
}: {
  candidate: CandidateSummary | Candidate;
  variant?: "primary" | "secondary" | "outline";
  disabled: boolean;
  /** Whether this is Debug's header, which needs no Debug link. */
  debugging?: boolean;
  onApprove(): void;
}) {
  const params = useIssueParams();
  const issue = useIssue();
  const [open, setOpen] = useState(false);
  const { results } = candidate;
  const replaced =
    issue.approved !== undefined && issue.approved.candidate !== candidate.id
      ? issue.approved.candidate
      : undefined;

  return (
    <>
      <Button variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        Approve
      </Button>
      <ConfirmDialog
        open={open}
        title={`Approve ${candidate.title}`}
        description="Approving records this Candidate's results at its test merge. Mark as shipped then merges it into main."
        confirmLabel={results === undefined ? "Approve" : `Approve ${short(results.run.sha)}`}
        blocked={!canApprove(issue.state, results)}
        onConfirm={() => {
          setOpen(false);
          onApprove();
        }}
        onClose={() => setOpen(false)}
      >
        <ProofsLoader candidate={candidate}>
          {(proofs) => (
            <section aria-label="Proofs" className="flex flex-col gap-2">
              <ProofList
                proofs={proofs}
                candidate={candidate}
                remedies={Object.fromEntries(
                  proofs.map((proof) => [proof.kind, remedy(proof, candidate, debugging, params)]),
                )}
              />
              <RunChange candidate={candidate} />
            </section>
          )}
        </ProofsLoader>
        <Rows>
          <Row label="Candidate">
            <span className="min-w-0 truncate">{candidate.title}</span>
            <Chip title={candidate.head_sha}>{short(candidate.head_sha)}</Chip>
          </Row>
          <Row label="Branch">
            <CandidateBranch candidate={candidate} named />
          </Row>
          {results !== undefined && (
            <Row label="Test merge">
              <Chip title={results.run.sha}>{short(results.run.sha)}</Chip>
            </Row>
          )}
          {replaced !== undefined && <Row label="Replaces">{replaced}</Row>}
          {"evals_behind" in candidate && candidate.evals_behind && (
            <Row label="Main">
              <span className="text-warning-ink">Has changes the evals branch lacks</span>
              <CandidateActions agent={params.agent} candidate={candidate} />
            </Row>
          )}
        </Rows>
      </ConfirmDialog>
    </>
  );
}

/** Debug's Approve, beside a Candidate that's Ready to approve and not already the approved one. */
export function ApproveButton({ candidate }: { candidate: Candidate }) {
  const issue = useIssue();
  const { pending, error, change } = useIssueChange();
  const current = issue.approved?.candidate === candidate.id && !issue.approved.outdated;
  if (current || !canApprove(issue.state, candidate.results)) {
    return null;
  }

  return (
    <span className="flex items-center gap-2">
      {error !== undefined && (
        <span role="alert" className="type-label-13 text-danger">
          {error}
        </span>
      )}
      <ApproveDialog
        candidate={candidate}
        variant="outline"
        disabled={pending}
        debugging
        onApprove={() => change({ action: "approve", candidate: candidate.id })}
      />
    </span>
  );
}
