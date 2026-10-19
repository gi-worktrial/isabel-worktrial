import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, GitBranch, Plus } from "lucide-react";
import { DropdownMenu as Menu } from "radix-ui";

import { CandidateStatusTag } from "#/candidate-results";
import { useIssueParams } from "#/issue-view";
import { candidatesQuery } from "#/queries";
import { cn } from "#/ui/cn";
import { Dropdown, MenuRadioGroup, MenuRadioItem } from "#/ui/menu";
import { type CandidateSummary, getCandidateBranchById, getEvalsBranchById } from "#src/sdk/issues";

// one muted warm hue per Candidate, by the order its pull request opened, so a Candidate keeps its color
const TINTS = [
  "bg-branch-1-tint text-branch-1",
  "bg-branch-2-tint text-branch-2",
  "bg-branch-3-tint text-branch-3",
  "bg-branch-4-tint text-branch-4",
  "bg-branch-5-tint text-branch-5",
  "bg-branch-6-tint text-branch-6",
] as const;
const SWATCHES = [
  "bg-branch-1",
  "bg-branch-2",
  "bg-branch-3",
  "bg-branch-4",
  "bg-branch-5",
  "bg-branch-6",
] as const;

/** A branch's color slot: a Candidate's place among the Issue's Candidates by when it opened, undefined for the evals branch. */
type BranchTone = number | undefined;

/** Each Candidate's tone, by the order their pull requests opened. */
function branchTones(candidates: ReadonlyArray<Pick<CandidateSummary, "id" | "pull_number">>) {
  return new Map(
    candidates
      .toSorted((a, b) => a.pull_number - b.pull_number)
      .map(({ id }, index) => [id, index % TINTS.length]),
  );
}

/** The tone a Candidate's branch shows in, and the one a new Candidate would get. */
export function useBranchTones() {
  const candidates = useQuery(candidatesQuery(useIssueParams())).data ?? [];
  return { tones: branchTones(candidates), next: candidates.length % TINTS.length };
}

/** A branch as a tinted tag: the branch icon and its name, the full ref in the tooltip. */
function BranchTag({
  name,
  branch,
  tone,
  className,
}: {
  name: string;
  /** The full branch ref. */
  branch: string;
  tone: BranchTone;
  className?: string | undefined;
}) {
  return (
    <span
      title={branch}
      className={cn(
        "inline-flex h-5 max-w-56 min-w-0 shrink-0 items-center gap-1 rounded-xs px-2 type-mono-12 whitespace-nowrap",
        tone === undefined ? "bg-inset text-ink" : TINTS[tone % TINTS.length],
        className,
      )}
    >
      <GitBranch aria-hidden="true" className="size-3 shrink-0" />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

/** A branch's color alone, for a list or a field naming it. */
export function BranchSwatch({ tone }: { tone: BranchTone }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        tone === undefined ? "bg-ring" : SWATCHES[tone % SWATCHES.length],
      )}
    />
  );
}

/**
 * A Candidate's branch tag, colored by its place among the Issue's Candidates, naming its head commit beside a title
 * that already names it, or the branch itself where `named`.
 */
export function CandidateBranch({
  candidate,
  named = false,
  className,
}: {
  candidate: Pick<CandidateSummary, "id" | "head_sha">;
  named?: boolean;
  className?: string;
}) {
  const { issue } = useIssueParams();
  const { tones } = useBranchTones();
  return (
    <BranchTag
      name={named ? candidate.id : candidate.head_sha.slice(0, 7)}
      branch={getCandidateBranchById(issue, candidate.id)}
      tone={tones.get(candidate.id)}
      className={className}
    />
  );
}

const EVALS = "evals";

/** Debug's branch switcher: the branch in view as its colored tag naming its head commit (the title already names the Candidate), opening the Issue's Candidates with their statuses, the evals branch and New Candidate. */
export function BranchSwitcher({
  current,
  sha,
  onNewCandidate,
}: {
  /** The Candidate in view, or undefined in Debug Evals. */
  current: string | undefined;
  /** The branch head in view. */
  sha: string;
  /** Starts a new Candidate from the one in view, when there is one. */
  onNewCandidate?: (() => void) | undefined;
}) {
  const params = useIssueParams();
  const navigate = useNavigate();
  const candidates = useQuery(candidatesQuery(params)).data ?? [];
  const tones = branchTones(candidates);

  function open(value: string) {
    if (value === (current ?? EVALS)) {
      return;
    }
    void navigate(
      value === EVALS
        ? { to: "/$orgId/agents/$agent/issues/$issue/debug/evals", params }
        : {
            to: "/$orgId/agents/$agent/issues/$issue/debug/candidates/$candidate",
            params: { ...params, candidate: value },
          },
    );
  }

  return (
    <Dropdown
      align="start"
      className="w-96 max-w-[calc(100vw-32px)]"
      trigger={
        <button
          type="button"
          aria-label={`Switch branch from ${current ?? EVALS}`}
          className="group inline-flex h-7 min-w-0 items-center gap-1 rounded-xs px-1 hover:bg-fill data-[state=open]:bg-fill"
        >
          <BranchTag
            name={sha.slice(0, 7)}
            branch={
              current === undefined
                ? getEvalsBranchById(params.issue)
                : getCandidateBranchById(params.issue, current)
            }
            tone={current === undefined ? undefined : tones.get(current)}
          />
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted" />
        </button>
      }
    >
      <MenuRadioGroup value={current ?? EVALS} onValueChange={open}>
        {candidates.map((candidate) => (
          <MenuRadioItem key={candidate.id} value={candidate.id} className="pr-2">
            <BranchSwatch tone={tones.get(candidate.id)} />
            <span className="min-w-0 flex-1 truncate" title={candidate.id}>
              {candidate.title}
            </span>
            <CandidateStatusTag candidate={candidate} />
          </MenuRadioItem>
        ))}
        <MenuRadioItem value={EVALS} className="pr-2">
          <BranchSwatch tone={undefined} />
          <span className="min-w-0 flex-1 truncate">Evals</span>
        </MenuRadioItem>
      </MenuRadioGroup>
      {onNewCandidate !== undefined && (
        <>
          <Menu.Separator className="my-1 h-px bg-divider" />
          <Menu.Item className="menu-item" onSelect={onNewCandidate}>
            <Plus aria-hidden="true" className="size-4 shrink-0" />
            New Candidate
          </Menu.Item>
        </>
      )}
    </Dropdown>
  );
}
