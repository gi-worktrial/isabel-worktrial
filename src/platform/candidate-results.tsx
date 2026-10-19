import { useQueryClient } from "@tanstack/react-query";
import {
  type Candidate,
  type CandidateResults,
  type CandidateStatus,
  type CandidateSummary,
  type EvalTally,
  getCandidateStatus,
} from "@grounded-intelligence/grounded-sdk";
import { useParams, useRouteContext } from "@tanstack/react-router";
import { useState, useTransition } from "react";

import { APPROVAL_OUTDATED, useIssue } from "#/issue-view";
import { useAgentRepo } from "#/queries";
import { Button } from "#/ui/button";
import { EmptyState } from "#/ui/empty-state";
import { Tag } from "#/ui/tag";

const allPassed = ({ passed, total }: EvalTally) => passed === total;

const STATUSES = {
  not_shipped: { word: "Not shipped", tone: "neutral" },
  not_run: { word: "Not run", tone: "neutral" },
  running: { word: "Running", tone: "neutral" },
  outdated: { word: "Out of date", tone: "neutral" },
  run_failed: { word: "Run failed", tone: "danger" },
  not_fixed: { word: "Doesn't fix yet", tone: "danger" },
  regresses: { word: "Regresses", tone: "danger" },
  ready: { word: "Ready to approve", tone: "neutral" },
} as const satisfies Record<CandidateStatus, { word: string; tone: "neutral" | "danger" }>;

/** The Candidate's status, or its approval when it's the approved one. */
export function CandidateStatusTag({
  candidate,
}: {
  candidate: Pick<CandidateSummary, "id" | "results">;
}) {
  const { state, approved } = useIssue();
  if (approved?.candidate === candidate.id) {
    return (
      <Tag tone={approved.outdated ? "warning" : "success"}>
        {approved.outdated ? APPROVAL_OUTDATED : "Approved"}
      </Tag>
    );
  }

  const { word, tone } = STATUSES[getCandidateStatus(state, candidate.results)];
  return <Tag tone={tone}>{word}</Tag>;
}

/** How many of a Candidate's New and Existing Evals pass in its newest completed run. */
export function CandidateResultTags({ results }: { results: CandidateResults | undefined }) {
  if (results?.new_evals === undefined || results.existing_evals === undefined) {
    return null;
  }

  const { new_evals, existing_evals, regressions } = results;
  const regressed = regressions !== undefined && regressions.length > 0;
  return (
    <span className="flex items-center gap-1">
      <Tag tone={allPassed(new_evals) ? "success" : "danger"}>
        {new_evals.passed}/{new_evals.total} New
      </Tag>
      <Tag
        tone={allPassed(existing_evals) ? "success" : regressed ? "danger" : "neutral"}
        title={regressed ? `Regressed: ${regressions.join(", ")}` : undefined}
      >
        {existing_evals.passed}/{existing_evals.total} Existing
      </Tag>
    </span>
  );
}

/** Sync merges main into the Issue's evals branch when it's behind; Run Evals runs every Eval on the Candidate's current test merge when it has no current, successful run. */
export function CandidateActions({ agent, candidate }: { agent: string; candidate: Candidate }) {
  const { client } = useRouteContext({ from: "/$orgId" });
  const repo = useAgentRepo({ orgId: useParams({ from: "/$orgId" }).orgId, agent });
  const issue = useIssue();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const status = getCandidateStatus(issue.state, candidate.results);

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
        setError(undefined);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
      await queryClient.invalidateQueries();
    });
  }

  return (
    <span className="flex items-center gap-2">
      {error !== undefined && (
        <span role="alert" className="type-label-13 font-normal text-danger">
          {error}
        </span>
      )}
      {candidate.evals_behind && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => client.issues.syncEvals({ repo, id: issue.id }))}
        >
          Sync
        </Button>
      )}
      {(status === "not_run" || status === "outdated" || status === "run_failed") && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(async () => {
              await client.issues.rerunCandidate({
                agent,
                repo,
                id: issue.id,
                candidate: candidate.id,
              });
            })
          }
        >
          {status === "not_run" ? "Run Evals" : "Rerun Evals"}
        </Button>
      )}
    </span>
  );
}

/** The page for a Candidate that was shipped or closed, or never existed. */
export function CandidateNotFound() {
  return (
    <section aria-label="Candidate not found" className="flex flex-col gap-4">
      <EmptyState
        title="This Candidate isn't open"
        description="It was shipped or closed, so it's no longer in this Issue."
      />
    </section>
  );
}
