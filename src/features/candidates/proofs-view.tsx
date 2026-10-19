import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, CircleDashed, LoaderCircle, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

import { CandidateResultTags } from "#/candidate-results";
import { useIssue, useIssueParams } from "#/issue-view";
import { RUN_POLL_INTERVAL, baselineRunQuery, isRunLive } from "#/queries";
import { cn } from "#/ui/cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/ui/collapsible";
import { Skeleton } from "#/ui/skeleton";
import { Tooltip } from "#/ui/tooltip";
import {
  PROOF_TITLES,
  type Proof,
  type ProofKind,
  type ProofStatus,
  candidateProofs,
  needsDebug,
  runChange,
} from "#src/features/candidates/proofs";
import { candidateRunsQuery, runEvalsQuery } from "#src/queries/extra";
import { type CandidateSummary, type JobRun, getCandidateStatus } from "#src/sdk/index";
import { AskPebble } from "#src/ui/ask-pebble";
import { ErrorView } from "#src/ui/error-view";
import { FOLD } from "#src/ui/fold";
import { Popover } from "#src/ui/popover";

const STATUS_WORDS = {
  pass: "text-success-ink",
  fail: "text-danger",
  running: "text-accent-ink",
  unknown: "text-warning-ink",
} as const satisfies Record<ProofStatus, string>;

/** A run's registry and results, undefined before the run exists and while it loads. */
export function useRunEvals(run: JobRun | undefined | null) {
  const params = useIssueParams();
  return useQuery({
    ...runEvalsQuery({ ...params, run: run?.id ?? "", sha: run?.sha ?? "" }),
    enabled: run !== undefined && run !== null,
  });
}

/**
 * A Candidate's proofs from platform's results, its run's Evals and the Issue's baseline, undefined while they load,
 * with the first read that failed and a retry of every read.
 */
function useCandidateProofs(candidate: CandidateSummary): {
  proofs: Proof[] | undefined;
  error: Error | null;
  retry(): void;
} {
  const params = useIssueParams();
  const { results } = candidate;
  // the baseline polls only while it runs
  const baseline = useQuery({
    ...baselineRunQuery(params),
    refetchInterval: ({ state: { data } }) =>
      data !== undefined && data !== null && isRunLive(data) ? RUN_POLL_INTERVAL : false,
  });
  const baselineRun = baseline.data;
  const baselineEvals = useRunEvals(baselineRun?.status === "completed" ? baselineRun : undefined);
  const run = useRunEvals(results?.run);
  const reads = [baseline, baselineEvals, run];
  const failure = {
    error: baseline.error ?? baselineEvals.error ?? run.error,
    retry: () => {
      for (const read of reads) {
        if (read.error !== null) {
          void read.refetch();
        }
      }
    },
  };

  if (
    baselineRun === undefined ||
    (baselineRun?.status === "completed" && baselineEvals.data === undefined) ||
    (results !== undefined && run.data === undefined)
  ) {
    return { proofs: undefined, ...failure };
  }
  return {
    proofs: candidateProofs({
      issue: params.issue,
      results,
      run: run.data,
      baseline: baselineRun === null ? undefined : { run: baselineRun, evals: baselineEvals.data },
    }),
    ...failure,
  };
}

/** The proofs, a skeleton while they load, or the failed read with its retry; `children` renders them. */
export function ProofsLoader({
  candidate,
  className,
  children,
}: {
  candidate: CandidateSummary;
  /** Spaces the skeleton and error. */
  className?: string;
  children(proofs: Proof[]): ReactNode;
}) {
  const { proofs, error, retry } = useCandidateProofs(candidate);
  if (proofs !== undefined) {
    return children(proofs);
  }
  return (
    <div className={className}>
      {error === null ? (
        <Skeleton className="h-40 w-full rounded-sm" />
      ) : (
        <ErrorView title="The proofs could not load" error={error} onRetry={retry} />
      )}
    </div>
  );
}

// whether a Candidate's newest run counted its New and Existing Evals, so there are results to show
const counted = ({ results }: CandidateSummary) =>
  results?.new_evals !== undefined && results.existing_evals !== undefined;

/** A Candidate page's Eval results as one group, which Walkthroughs wait on, once there are counts to show. */
export function EvalResults({ candidate }: { candidate: CandidateSummary }) {
  return counted(candidate) ? (
    <Collapsible asChild>
      <section aria-label="Eval results" className="flex flex-col gap-2">
        <CollapsibleTrigger>
          <CandidateResultTags results={candidate.results} />
        </CollapsibleTrigger>
        <CollapsibleContent className={FOLD}>
          <div className="overflow-clip card">
            <ProofsLoader candidate={candidate} className="p-4">
              {(proofs) => (
                <>
                  <ProofList proofs={proofs} candidate={candidate} className="px-3 py-1" />
                  <RunChange candidate={candidate} className="border-t border-divider px-3 py-2" />
                  <AskWhy candidate={candidate} proofs={proofs} />
                </>
              )}
            </ProofsLoader>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  ) : null;
}

/**
 * A Candidate's New and Existing counts (platform's tags), opening the four proofs behind them, each linked to its
 * evidence; nothing before its first counted run, where its status tag says why.
 */
export function CandidateProofs({ candidate }: { candidate: CandidateSummary }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  if (!counted(candidate)) {
    return null;
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      opener={opener}
      align="start"
      sideOffset={4}
      aria-label={`Proofs: ${candidate.title}`}
      className="flex w-88 max-w-[calc(100vw-32px)] flex-col"
      // the tags toggle the popover themselves, so a press on them isn't a press outside
      onPointerDownOutside={(event) => {
        if (event.target instanceof Node && opener.current?.contains(event.target)) {
          event.preventDefault();
        }
      }}
      anchor={
        <button
          ref={opener}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="relative z-10 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-xs text-muted hover:brightness-95 dark:hover:brightness-125"
        >
          <CandidateResultTags results={candidate.results} />
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </button>
      }
    >
      <ProofsLoader candidate={candidate} className="p-4">
        {(proofs) => (
          <>
            <ProofList proofs={proofs} candidate={candidate} className="px-3 py-1" />
            <RunChange candidate={candidate} className="border-t border-divider px-3 py-2" />
            <AskWhy candidate={candidate} proofs={proofs} />
          </>
        )}
      </ProofsLoader>
    </Popover>
  );
}

// what Pebble is asked about a Candidate that isn't ready, by its status
const WHY = {
  regresses: {
    label: "why it regresses",
    ask: (title: string) => `Why does Candidate "${title}" regress?`,
  },
  not_fixed: {
    label: "why it doesn't fix yet",
    ask: (title: string) => `Why doesn't Candidate "${title}" fix the Issue yet?`,
  },
  run_failed: {
    label: "why the run failed",
    ask: (title: string) => `Why did the Eval run for Candidate "${title}" fail?`,
  },
} as const;

/** Ask Pebble under the proofs, when the status is red or a proof fails. */
function AskWhy({ candidate, proofs }: { candidate: CandidateSummary; proofs: readonly Proof[] }) {
  const status = getCandidateStatus(useIssue().state, candidate.results);
  const failing = proofs.find((proof) => proof.status === "fail");
  const why = needsDebug(status)
    ? WHY[status]
    : failing && {
        label: `why ${PROOF_TITLES[failing.kind]} fails`,
        ask: (title: string) =>
          `Why does ${PROOF_TITLES[failing.kind]} fail for Candidate "${title}"?`,
      };
  if (!why) {
    return null;
  }
  return (
    <div className="px-2 pb-2">
      <AskPebble label={`Ask Pebble ${why.label}`} prompt={why.ask(candidate.title)} />
    </div>
  );
}

const PROOF_ICONS = {
  pass: Check,
  fail: X,
  running: LoaderCircle,
  unknown: CircleDashed,
} as const satisfies Record<ProofStatus, unknown>;

function ProofMark({ status }: { status: ProofStatus }) {
  const Icon = PROOF_ICONS[status];
  return (
    <span className={cn("flex h-5 items-center", STATUS_WORDS[status])}>
      <Icon
        aria-hidden="true"
        className={cn("size-3.5", status === "running" && "motion-safe:animate-spin")}
      />
    </span>
  );
}

const STATUS_NAMES = {
  pass: "holds",
  fail: "fails",
  running: "running",
  unknown: "not shown yet",
} as const satisfies Record<ProofStatus, string>;

/** The four proofs, one line each (title, claim, count linking to the run that shows it), with an optional fix under one that fails. */
export function ProofList({
  proofs,
  candidate,
  remedies = {},
  className,
}: {
  proofs: readonly Proof[];
  candidate: CandidateSummary;
  /** What to do about each proof that doesn't hold, shown under it. */
  remedies?: Partial<Record<ProofKind, ReactNode>>;
  className?: string;
}) {
  const params = useIssueParams();
  const baseline = useQuery(baselineRunQuery(params)).data ?? undefined;
  const run = candidate.results?.run;
  // the count links to the run that shows it
  const count = (proof: Proof) => {
    const [label, target] =
      proof.kind === "reproduction" ? ["Baseline run", baseline] : ["Eval run", run];
    const words = proof.count === undefined ? "None" : `${proof.count.passed}/${proof.count.total}`;
    const look = cn("type-label-13 font-semibold tabular-nums", STATUS_WORDS[proof.status]);
    return target === undefined ? (
      <span className={look}>{words}</span>
    ) : (
      <Tooltip label={`Open the ${label.toLowerCase()}`}>
        <Link
          to="/$orgId/agents/$agent/runs/$run"
          params={{ orgId: params.orgId, agent: params.agent, run: target.id }}
          aria-label={`${words}, ${label}`}
          className={cn(look, "rounded-xs px-1 hover:bg-fill")}
        >
          {words}
        </Link>
      </Tooltip>
    );
  };

  return (
    <ul aria-label="Proofs" className={cn("flex flex-col", className)}>
      {proofs.map((proof) => {
        const fix = proof.status === "pass" ? undefined : remedies[proof.kind];
        return (
          <li
            key={proof.kind}
            aria-label={`${PROOF_TITLES[proof.kind]} ${STATUS_NAMES[proof.status]}`}
            className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-2 py-1"
          >
            <ProofMark status={proof.status} />
            <div className="flex min-w-0 flex-col">
              <p className="flex h-5 min-w-0 items-baseline gap-2">
                <span className="shrink-0 type-label-13 font-medium text-ink">
                  {PROOF_TITLES[proof.kind]}
                </span>
                <span className="truncate type-meta-12 text-muted" title={proof.claim}>
                  {proof.claim}
                </span>
              </p>
              {proof.note !== undefined && (
                <p
                  className={cn(
                    "type-meta-12",
                    proof.status === "pass" ? "text-muted" : STATUS_WORDS[proof.status],
                  )}
                >
                  {proof.note}
                </p>
              )}
              {fix !== undefined && fix !== null && (
                <div className="mt-2 flex flex-wrap items-center gap-2">{fix}</div>
              )}
            </div>
            <span className="flex h-5 items-center">{count(proof)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** How the Candidate's newest run differs from its run on the revision before, when it has one. */
export function RunChange({
  candidate,
  className,
}: {
  candidate: CandidateSummary;
  className?: string;
}) {
  const params = useIssueParams();
  const { results } = candidate;
  const runs = useQuery({
    ...candidateRunsQuery({
      ...params,
      pull: candidate.pull_number,
      newest: results?.run.id ?? "",
    }),
    enabled: results?.run.status === "completed",
  });
  const previous = runs.data?.find(
    ({ status, sha, created_at }) =>
      status === "completed" &&
      results !== undefined &&
      sha !== results.run.sha &&
      created_at < results.run.created_at,
  );
  const before = useRunEvals(previous);
  const now = useRunEvals(previous === undefined ? undefined : results?.run);
  if (before.data === undefined || now.data === undefined) {
    return null;
  }

  const { fixed, broke } = runChange(before.data, now.data);
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 type-label-13 text-muted", className)}>
      <span className="font-medium text-ink">Since the previous revision</span>
      {fixed === 0 && broke === 0 ? (
        <span>No Eval changed</span>
      ) : (
        <>
          <span className={fixed > 0 ? "text-success-ink" : undefined}>+{fixed} fixed</span>
          <span className={broke > 0 ? "text-danger" : undefined}>{broke} newly failing</span>
        </>
      )}
    </p>
  );
}
