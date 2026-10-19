// the Issue's Activity as a log: a day heading over its events, each one line of time, a mark, who did it and what,
// read from platform's commit subjects, with the state change as from and to tags where the event moved the Issue
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Ban,
  BadgeCheck,
  CircleCheck,
  GitMerge,
  type LucideIcon,
  ListMinus,
  ListPlus,
  Pencil,
  Rocket,
  RotateCcw,
  ScanSearch,
  Undo2,
  Wrench,
} from "lucide-react";

import { STATE_WORDS } from "#/issue-view";
import { type IssueParams, candidatesQuery } from "#/queries";
import { EmptyState } from "#/ui/empty-state";
import { formatExact } from "#/ui/format";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import { STATE_TONES } from "#src/features/inbox/lanes";
import type { CandidateSummary, IssueEvent, IssueState } from "#src/sdk/index";
import { Chip } from "#src/ui/chip";
import { relativeTime } from "#src/ui/short-timestamp";

// platform's commit subjects (sdk/issues.ts and demo-data's history), each as a verb and its mark; a Candidate the
// subject names follows the verb
const ACTIONS: ReadonlyArray<{
  subject: RegExp;
  verb: string;
  mark: LucideIcon;
  to?: IssueState;
}> = [
  { subject: /^Find issue /u, verb: "found the Issue", mark: ScanSearch, to: "detected" },
  {
    subject: /^Validate issue /u,
    verb: "validated the Issue",
    mark: CircleCheck,
    to: "reviewing",
  },
  { subject: /^Dismiss issue /u, verb: "dismissed the Issue", mark: Ban, to: "dismissed" },
  { subject: /^Reopen issue /u, verb: "reopened the Issue", mark: RotateCcw, to: "reviewing" },
  {
    subject: /^Move issue \S+ back to detected/u,
    verb: "moved the Issue back",
    mark: Undo2,
    to: "detected",
  },
  { subject: /^Add candidate (\S+) to issue /u, verb: "proposed", mark: Wrench },
  { subject: /^Approve candidate (\S+) of issue /u, verb: "approved", mark: BadgeCheck },
  {
    subject: /^Remove approval of candidate (\S+) from issue /u,
    verb: "removed the approval of",
    mark: Undo2,
  },
  { subject: /^Merge candidate (\S+) of issue /u, verb: "merged", mark: GitMerge },
  { subject: /^Ship candidate (\S+) of issue /u, verb: "shipped", mark: Rocket, to: "resolved" },
  { subject: /^Add trace \S+ to issue /u, verb: "added a Trace", mark: ListPlus },
  { subject: /^Remove trace \S+ from issue /u, verb: "removed a Trace", mark: ListMinus },
  { subject: /^(?:Write|Edit) evals of issue /u, verb: "edited the Evals", mark: Pencil },
  { subject: /^Edit notes of issue /u, verb: "edited the notes", mark: Pencil },
];

const actionOf = ({ subject }: IssueEvent) =>
  ACTIONS.find((action) => action.subject.test(subject));

// the state an event moved the Issue to: platform's when its commit says, else its action's
const stateAfter = (event: IssueEvent) => event.state ?? actionOf(event)?.to;

type Entry = { event: IssueEvent; from: IssueState | undefined };

// each event with the state the Issue was in before it, walking from the oldest
function withFrom(events: readonly IssueEvent[]): Entry[] {
  let state: IssueState | undefined;
  return events
    .toReversed()
    .map((event) => {
      const entry = { event, from: state };
      state = stateAfter(event) ?? state;
      return entry;
    })
    .toReversed();
}

/** The Issue's events newest first, grouped by day. */
export function ActivityLog({
  events,
  names,
  params,
}: {
  events: readonly IssueEvent[];
  names: Readonly<Record<string, string>>;
  params: IssueParams;
}) {
  // the open Candidates, so one an event names reads by its title and opens; a shipped one reads by its id
  const candidates = useQuery(candidatesQuery(params)).data ?? [];
  if (events.length === 0) {
    return <EmptyState title="No activity yet" />;
  }

  return (
    <ol className="flex flex-col">
      {withFrom(events).map(({ event, from }) => (
        <EventLine
          key={event.sha}
          event={event}
          from={from}
          actor={names[event.author] ?? event.author}
          candidates={candidates}
          params={params}
        />
      ))}
    </ol>
  );
}

function EventLine({
  event,
  from,
  actor,
  candidates,
  params,
}: {
  event: IssueEvent;
  from: IssueState | undefined;
  actor: string;
  candidates: readonly CandidateSummary[];
  params: IssueParams;
}) {
  const action = actionOf(event);
  const named = action?.subject.exec(event.subject)?.[1];
  const Mark = action?.mark ?? Pencil;
  // a Find starts the Issue, so it has no change to show
  const to = from === undefined && event.state === undefined ? undefined : stateAfter(event);

  return (
    <li className="flex min-h-8 min-w-0 items-start gap-3 py-1 type-label-13">
      <Mark aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex h-6 min-w-0 items-center gap-1">
          {event.via === undefined ? (
            <span className="shrink-0 font-medium text-ink">{actor}</span>
          ) : (
            <Tooltip label={`via ${event.via}`}>
              <span className="shrink-0 font-medium text-ink">{actor}</span>
            </Tooltip>
          )}
          <span className="truncate text-ink" title={event.subject}>
            {action?.verb ?? event.subject}
          </span>
          {named !== undefined && (
            <CandidateName id={named} candidates={candidates} params={params} />
          )}
        </span>
        {to !== undefined && to !== from && (
          <span className="flex items-center gap-1">
            {from !== undefined && (
              <>
                <Tag tone={STATE_TONES[from]}>{STATE_WORDS[from]}</Tag>
                <ArrowRight aria-label="to" className="size-3.5 text-muted" />
              </>
            )}
            <Tag tone={STATE_TONES[to]}>{STATE_WORDS[to]}</Tag>
          </span>
        )}
      </div>
      <Tooltip label={formatExact(event.at)}>
        <time
          dateTime={event.at}
          className="h-6 min-w-14 shrink-0 text-right leading-6 whitespace-nowrap text-muted tabular-nums"
        >
          {relativeTime(event.at)}
        </time>
      </Tooltip>
    </li>
  );
}

function CandidateName({
  id,
  candidates,
  params,
}: {
  id: string;
  candidates: readonly CandidateSummary[];
  params: IssueParams;
}) {
  const candidate = candidates.find((open) => open.id === id);
  if (candidate === undefined) {
    return (
      <Chip kind="candidates" code>
        {id}
      </Chip>
    );
  }
  return (
    <Chip asChild kind="candidates" className="shrink">
      <Link
        to="/$orgId/agents/$agent/issues/$issue/candidates/$candidate"
        params={{ ...params, candidate: id }}
        title={candidate.title}
      >
        <span className="min-w-0 truncate">{candidate.title}</span>
      </Link>
    </Chip>
  );
}
