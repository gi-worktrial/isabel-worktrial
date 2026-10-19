import { Check, Play, RotateCcw, X } from "lucide-react";
import { use, useRef, useState, useSyncExternalStore } from "react";

import { IconButton } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/ui/collapsible";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import { useConnection, useNavigate, useQueryClient } from "#src/app/public";
import { STORY_IDS, WALKTHROUGH_IDS, type WalkthroughId } from "#src/demo/plane/seed/walkthroughs";
import { resetViewer } from "#src/demo/reset";
import {
  getStarted,
  requestWalkthrough,
  usePresenting,
  useWalkthroughOffers,
  useWalkthroughs,
  WalkthroughsContext,
} from "#src/demo/walkthrough/state";
import { ConfirmDialog } from "#src/ui/confirm-dialog";
import { Popover } from "#src/ui/popover";
import { StepMark, Steps } from "#src/ui/steps";

// goes once every Walkthrough is done since the palette still plays each, and outside an Agent, whose Walkthroughs
// it lists; in the sidebar's rail it is its ring, named in a tooltip
export function GetStarted({ collapsed }: { collapsed: boolean }) {
  const playing = usePresenting();
  const inAgent = use(WalkthroughsContext) !== null;
  const { done } = useSyncExternalStore(getStarted.subscribe, getStarted.getSnapshot);
  const [open, setOpen] = useState(false);
  const pill = useRef<HTMLButtonElement>(null);
  const watched = STORY_IDS.filter((id) => done.includes(id)).length;
  const total = STORY_IDS.length;
  if (playing || !inAgent || WALKTHROUGH_IDS.every((id) => done.includes(id))) {
    return null;
  }
  const count = (
    <span className="type-meta-12 text-muted tabular-nums">{`${watched}/${total}`}</span>
  );
  const button = (
    <button
      ref={pill}
      type="button"
      aria-label={`Get started, ${watched} of ${total} complete`}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(
        "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xs bg-selection px-3 type-label-13 text-accent-ink hover:bg-accent/15 aria-expanded:bg-accent/15",
        collapsed && "justify-center px-0",
      )}
    >
      <Ring value={watched} max={total} />
      <span className={cn("flex-1 truncate text-left", collapsed && "sr-only")}>Get started</span>
      {!collapsed && count}
    </button>
  );
  return (
    <Popover
      opener={pill}
      open={open}
      onOpenChange={setOpen}
      side={collapsed ? "right" : "top"}
      align={collapsed ? "end" : "start"}
      // in the rail, 8px clear of its edge, since the ring's row ends 4px inside it
      sideOffset={collapsed ? 12 : 8}
      collisionPadding={{ top: 8, bottom: 8 }}
      // the panel takes the focus, since its first control is Reset demo and focus would open its tooltip
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        (event.currentTarget as HTMLElement).focus();
      }}
      // the pill toggles it, so a press on the pill is not a press outside
      onInteractOutside={(event) => {
        if (pill.current?.contains(event.target as Node)) {
          event.preventDefault();
        }
      }}
      className="flex max-h-[calc(100vh-80px)] w-[300px] flex-col overflow-hidden data-[state=open]:animate-[enter_160ms_ease-out]"
      // the anchor holds the tooltip's element, since the tooltip passes on no ref of its own
      anchor={
        collapsed ? (
          <span className="flex min-w-10 flex-1">
            <Tooltip label={`Get started, ${watched}/${total}`} side="right">
              {button}
            </Tooltip>
          </span>
        ) : (
          button
        )
      }
    >
      <Panel done={done} watched={watched} total={total} onClose={() => setOpen(false)} />
    </Popover>
  );
}

// the faint track keeps 0 readable
function Ring({ value, max }: { value: number; max: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0 -rotate-90">
      <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2" className="stroke-accent/30" />
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        strokeWidth="2"
        pathLength={max}
        strokeDasharray={`${value} ${max}`}
        className="stroke-accent"
      />
    </svg>
  );
}

// a full ring with a check so done reads apart from not started at a glance
function DoneMark() {
  return (
    <span className="relative flex size-4 shrink-0 items-center justify-center text-accent">
      <Ring value={1} max={1} />
      <Check aria-hidden="true" className="absolute size-2.5" strokeWidth={3.5} />
    </span>
  );
}

// Primary has no topics so it stays one open list
function topicsOf<Row extends { walkthrough: { topic?: string | undefined } }>(
  rows: readonly Row[],
) {
  const topics: Array<{ topic: string | undefined; rows: Row[] }> = [];
  for (const row of rows) {
    const { topic } = row.walkthrough;
    const found = topics.find((entry) => entry.topic === topic);
    if (found === undefined) {
      topics.push({ topic, rows: [row] });
    } else {
      found.rows.push(row);
    }
  }
  return topics;
}

// Features fold by topic so the panel stays short
function Panel({
  done,
  watched,
  total,
  onClose,
}: {
  done: readonly WalkthroughId[];
  watched: number;
  total: number;
  onClose(): void;
}) {
  const [resetting, setResetting] = useState(false);
  const offers = useWalkthroughOffers();
  const { groups: authoredGroups } = useWalkthroughs();
  const next = offers.find(
    ({ walkthrough, unavailable }) => unavailable === null && !done.includes(walkthrough.id),
  );
  const groups = authoredGroups.map(({ id, label }) => ({
    label,
    request: id,
    rows: offers.filter((offer) => offer.walkthrough.group === id),
  }));
  const offerRow = ({ walkthrough, unavailable }: (typeof offers)[number]) => {
    const ticked = done.includes(walkthrough.id);
    const state = ticked ? "done" : next?.walkthrough.id === walkthrough.id ? "current" : "waiting";
    return (
      <Tooltip
        key={walkthrough.id}
        label={
          <>
            <span className="block font-medium">{walkthrough.name}</span>
            {unavailable ?? walkthrough.purpose}
          </>
        }
        side="right"
      >
        <li
          aria-current={state === "current" ? "step" : undefined}
          className={cn(
            "group/row relative flex h-8 min-w-0 items-center gap-2 rounded-xs px-2 type-label-13 has-[button:enabled:hover]:bg-subtle",
            // an unavailable row's mark and length fade, so it reads as off at a glance
            unavailable !== null && "[&>span]:opacity-50",
          )}
        >
          {ticked ? <DoneMark /> : <StepMark state={state} />}
          <button
            type="button"
            disabled={unavailable !== null}
            aria-description={ticked ? "Completed" : "Not completed"}
            onClick={() => requestWalkthrough(walkthrough.id)}
            className={cn(
              "min-w-0 flex-1 truncate text-left outline-none after:absolute after:inset-0 after:rounded-xs after:outline-ring focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-solid enabled:cursor-pointer disabled:text-faint",
              state === "current" ? "font-medium text-ink" : "text-muted",
            )}
          >
            {walkthrough.name}
          </button>
          <Tag className="text-muted">{`${walkthrough.minutes} min`}</Tag>
          <Play
            aria-hidden="true"
            className="size-3.5 shrink-0 fill-current text-muted opacity-0 group-has-[button:enabled:hover]/row:opacity-100 group-has-[button:focus-visible]/row:opacity-100"
          />
        </li>
      </Tooltip>
    );
  };
  return (
    <section aria-labelledby="get-started-title" className="flex min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-divider pr-2 pl-3">
        <Ring value={watched} max={total} />
        <h2 id="get-started-title" className="type-label-13 font-semibold text-ink">
          Get started
        </h2>
        <span className="type-meta-12 text-muted tabular-nums">{`${watched}/${total}`}</span>
        <span className="ml-auto flex items-center gap-1">
          <IconButton label="Reset demo" size="small" onClick={() => setResetting(true)}>
            <RotateCcw className="size-4" />
          </IconButton>
          <IconButton label="Close" size="small" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {groups.map(({ label, request, rows }) =>
          rows.length === 0 ? null : (
            <div key={label} className="pb-1">
              <div className="flex h-7 items-center justify-between pr-1 pl-2">
                <p className="type-meta-12 text-muted">{label}</p>
                <IconButton
                  label={`Play all ${label}`}
                  size="small"
                  disabled={rows.every(({ unavailable }) => unavailable !== null)}
                  onClick={() => requestWalkthrough(request)}
                >
                  <Play className="size-4" />
                </IconButton>
              </div>
              {topicsOf(rows).map(({ topic, rows: topicRows }) =>
                topic === undefined ? (
                  <Steps key={label} label={label}>
                    {topicRows.map(offerRow)}
                  </Steps>
                ) : (
                  <Collapsible key={topic}>
                    <CollapsibleTrigger className="mx-0 w-full px-2 type-label-13 text-muted hover:text-ink">
                      <span className="min-w-0 flex-1 truncate">{topic}</span>
                      <span className="type-meta-12 tabular-nums">{topicRows.length}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-4">
                      <Steps label={topic}>{topicRows.map(offerRow)}</Steps>
                    </CollapsibleContent>
                  </Collapsible>
                ),
              )}
            </div>
          ),
        )}
      </div>
      <ResetDemo open={resetting} onClose={() => setResetting(false)} />
    </section>
  );
}

export function ResetDemo({ open, onClose }: { open: boolean; onClose(): void }) {
  const connection = useConnection();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  if (connection === null) {
    return null;
  }
  const { client, agentId } = connection;
  return (
    <ConfirmDialog
      open={open}
      title="Reset this demo?"
      description={`Clears every review and conversation for ${agentId}, and starts Get started over. The theme stays.`}
      confirmLabel="Reset"
      destructive
      onConfirm={() => {
        getStarted.clear();
        resetViewer({ client, agentId });
        void queryClient.invalidateQueries({ refetchType: "all" });
        onClose();
        void navigate({
          to: "/$orgId/agents/$agent/issues",
          params: { orgId: client.orgId, agent: agentId },
        });
      }}
      onClose={onClose}
    />
  );
}
