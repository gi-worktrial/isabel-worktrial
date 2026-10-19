import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { issueQuery, useAgentRepo } from "#/queries";
import {
  GroundedError,
  type Issue,
  type IssueActionName,
  type IssueChange,
  type IssueStatus,
  type IssueState,
  type Severity,
} from "@grounded-intelligence/grounded-sdk";
import { useParams, useRouteContext, useRouter } from "@tanstack/react-router";
import { useState, useTransition } from "react";

import { cn } from "#/ui/cn";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import { AskPebbleStep } from "#src/features/issue/ask-pebble";
import { StepLink } from "#src/features/issue/step-link";

export const STATE_WORDS = {
  detected: "New",
  reviewing: "In progress",
  resolved: "Resolved",
  dismissed: "Dismissed",
} as const satisfies Record<IssueState, string>;

export const SEVERITY_WORDS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
} as const satisfies Record<Severity, string>;

export const ACTION_WORDS = {
  validate: "Validate",
  dismiss: "Dismiss",
  reopen: "Reopen",
  reset: "Move back to Detected",
} as const satisfies Record<IssueActionName, string>;

export const APPROVAL_OUTDATED = "Approved revision is out of date";

const BRANCH_MOVED_STATUS = 409;

/** The params of the Issue page or Debug workspace this is in. */
export function useIssueParams() {
  const { orgId, agent, issue } = useParams({ strict: false });
  if (orgId === undefined || agent === undefined || issue === undefined) {
    throw new Error("Expected an Issue route");
  }

  return { orgId, agent, issue };
}

/** The open Issue. */
export function useIssue() {
  return useSuspenseQuery(issueQuery(useIssueParams())).data;
}

/** Commits changes to the open Issue from the commit the page read, reloading it after each. */
export function useIssueChange() {
  const { client } = useRouteContext({ from: "/$orgId" });
  const params = useIssueParams();
  const repo = useAgentRepo(params);
  const issue = useIssue();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function change(next: IssueChange, onSuccess?: () => void | Promise<void>) {
    startTransition(async () => {
      try {
        await client.issues.update({
          agent: params.agent,
          repo,
          id: issue.id,
          expectedHeadOid: issue.head_oid,
          ...next,
        });
        setError(undefined);
        await onSuccess?.();
        // A shipped Candidate's pull is merged, so its page no longer loads.
        const to = "/$orgId/agents/$agent/issues/$issue";
        if (
          next.action === "ship" &&
          router.matchRoute({ to, params }, { fuzzy: true }) !== false
        ) {
          await router.navigate({ to, params });
        }
      } catch (caught) {
        if (caught instanceof GroundedError && caught.status === BRANCH_MOVED_STATUS) {
          setError("This Issue changed since the page loaded, so it now shows the latest");
        } else {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      }
      await queryClient.invalidateQueries();
    });
  }

  return { pending, error, change };
}

const PILLS = {
  running: { tone: "accent", word: "Running", tip: "A job is working on this Issue" },
  resurfaced: { tone: "warning", word: "Resurfaced", tip: "Back in review after its fix shipped" },
  possible_regression: {
    tone: "warning",
    word: "Possible regression",
    tip: "A regression pull request is open for this Issue",
  },
} as const satisfies Record<
  Exclude<IssueStatus, "pending">,
  { tone: string; word: string; tip: string }
>;

/** A live status, since a pending Issue is simply waiting on an engineer. */
export function StatusPill({ status }: { status: IssueStatus | undefined }) {
  if (status === undefined || status === "pending") {
    return null;
  }

  const { tone, word, tip } = PILLS[status];
  return (
    <Tooltip label={tip}>
      <Tag tone={tone} className="relative z-10">
        {word}
      </Tag>
    </Tooltip>
  );
}

const PHASES = ["review", "deploy"] as const;
export type Phase = (typeof PHASES)[number];

const PHASE_STEPS = {
  review: {
    word: "Review",
    tip: "Find a Candidate that passes the Issue's Evals, then approve it",
  },
  deploy: { word: "Deploy", tip: "Ship the approved Candidate, which resolves the Issue" },
} as const satisfies Record<Phase, { word: string; tip: string }>;

/** The step an open Issue is on. */
const getIssuePhase = ({ approved }: Pick<Issue, "approved">): Phase =>
  approved === undefined ? "review" : "deploy";

/** Review and Deploy with the Issue's current step marked, every step done once it's resolved, and none once it's dismissed. */
export function IssueSteps({ issue, debugging = false }: { issue: Issue; debugging?: boolean }) {
  if (issue.state === "dismissed") {
    return null;
  }

  const current = currentStep(issue, debugging);

  return (
    <ol aria-label="Progress" className="grid grid-cols-2 gap-2">
      {PHASES.map((phase, at) => {
        const { word, tip } = PHASE_STEPS[phase];
        return (
          <li key={phase} className="flex">
            <span
              aria-current={at === current ? "step" : undefined}
              className={cn(
                "flex flex-1 flex-col gap-2 type-copy-14 motion-safe:transition-colors",
                at === current
                  ? "font-medium text-ink"
                  : at < current
                    ? "text-muted"
                    : "text-faint",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1 rounded-full motion-safe:transition-colors motion-safe:duration-300",
                  at <= current ? "bg-accent" : "bg-divider",
                )}
              />
              <span className="flex h-6 items-center gap-1">
                <StepLink issue={issue} phase={phase} tip={tip}>
                  <span className="flex items-center gap-1.5">
                    <StepMark done={at < current} current={at === current} />
                    {phase === "review" && debugging ? "Debugging" : word}
                  </span>
                </StepLink>
                {at === current && !debugging && <AskPebbleStep issue={issue} phase={phase} />}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepMark({ done, current }: { done: boolean; current: boolean }) {
  const progress = done ? "done" : current ? "current" : "todo";
  return <ProgressMark progress={progress} className={STEP_TONES[progress]} />;
}

const STEP_TONES = { done: "text-muted", current: "text-accent", todo: "text-divider-strong" };

// Debugging is review work, so it stays the current step.
const currentStep = (issue: Issue, debugging: boolean) =>
  issue.state === "resolved"
    ? PHASES.length
    : PHASES.indexOf(debugging ? "review" : getIssuePhase(issue));

type Progress = "todo" | "current" | "done" | "dismissed";

/** The stepper's glyphs in the text color: a dashed ring to do, a ring with a dot in progress, a check done, a slashed ring dismissed. */
function ProgressMark({
  progress,
  className,
}: {
  progress: Progress;
  className?: string | undefined;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      className={cn("size-4 shrink-0", className)}
    >
      {progress === "done" ? (
        <>
          <circle cx="8" cy="8" r="8" fill="currentColor" stroke="none" opacity="0.16" />
          <path
            d="M5 8.25 7 10.25 11 6"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : progress === "current" ? (
        <>
          <circle cx="8" cy="8" r="7" strokeWidth="2" />
          <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />
        </>
      ) : (
        <circle cx="8" cy="8" r="7.5" strokeDasharray={progress === "todo" ? "2.5 2" : undefined} />
      )}
      {progress === "dismissed" && <path d="M5 11 11 5" strokeLinecap="round" />}
    </svg>
  );
}

// each state as the stepper draws its steps, tinted in the mark alone
const STATE_MARKS = {
  detected: ["todo", "text-muted"],
  reviewing: ["current", "text-accent"],
  resolved: ["done", "text-success-ink"],
  dismissed: ["dismissed", "text-faint"],
} as const satisfies Record<IssueState, readonly [Progress, string]>;

/** An Issue state's mark, before its word on the board's lanes, the State fact and the list. */
export function StateMark({ state, className }: { state: IssueState; className?: string }) {
  const [progress, tone] = STATE_MARKS[state];
  return <ProgressMark progress={progress} className={cn(tone, className)} />;
}

// Low, Medium and High fill 1, 2 or 3 of these bars, whose heights are in the icon's 14-unit viewBox.
const SEVERITY_BARS = [4, 7.5, 11];
const FILLED_BARS = { low: 1, medium: 2, high: 3 } as const;

export const traceCount = (count: number) => `${count} ${count === 1 ? "trace" : "traces"}`;

// Priority bars like Linear's, with Critical a red square.
export function SeverityMark({ severity }: { severity: Severity }) {
  return (
    <Tooltip label={SEVERITY_WORDS[severity]}>
      <svg
        viewBox="0 0 14 14"
        role="img"
        aria-label={SEVERITY_WORDS[severity]}
        className={`size-3.5 shrink-0 ${severity === "critical" ? "text-danger" : "text-ink"}`}
      >
        {severity === "critical" ? (
          <>
            <rect width="14" height="14" rx="3" fill="currentColor" />
            <path
              d="M7 3.5v4.25M7 10.25v.25"
              className="stroke-surface"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </>
        ) : (
          SEVERITY_BARS.map((height, at) => (
            <rect
              key={height}
              x={1 + at * 4.5}
              y={12.5 - height}
              width="3"
              height={height}
              rx="1"
              fill="currentColor"
              className={at < FILLED_BARS[severity] ? undefined : "text-divider-strong"}
            />
          ))
        )}
      </svg>
    </Tooltip>
  );
}
