// a session page turn's row: its number as a badge (red when the turn fails) in place of the word Turn, and each part
// of an open turn led by a round mark rather than a label, the agent's reply in the accent so it stands out from its steps
import { Bot, Wrench } from "lucide-react";

import { cn } from "#/ui/cn";
import type { Turn } from "#src/sdk/agents";
import { FAIL_LABEL } from "#src/sdk/evals";

/** A turn's Spans link: outlined, so each turn has a clear way into its spans. */
export const SPANS_LINK = "shrink-0 border border-divider bg-surface text-ink";

/** A turn's number in a round badge, read as "Turn 3", red when the turn fails. */
export function TurnNumber({ turn }: { turn: Turn }) {
  const failing = turn.annotations.some(({ label }) => label === FAIL_LABEL);
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full type-meta-12 font-semibold tabular-nums",
        failing ? "bg-danger-tint text-danger" : "bg-inset text-ink",
      )}
    >
      <span className="sr-only">Turn </span>
      {turn.position}
    </span>
  );
}

const MARKS = {
  "Agent steps": { Icon: Wrench, tone: "bg-inset text-muted" },
  "Agent response": { Icon: Bot, tone: "bg-accent-tint text-accent-ink" },
} as const;

export type PartName = keyof typeof MARKS;

/** A turn part's mark, its name for screen readers. */
export function PartMark({ who }: { who: PartName }) {
  const { Icon, tone } = MARKS[who];
  return (
    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", tone)}>
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{who}</span>
    </span>
  );
}
