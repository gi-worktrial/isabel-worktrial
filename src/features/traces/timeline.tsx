// the session page's timeline: with several turns, one segment per turn as wide as it ran and a red tick at each
// failing step, so a long session reads at any width; a single turn keeps platform's per-step blocks
import { use } from "react";

import { SpanTimeline, counted, spanKind, spanLabel } from "#/traces";
import { cn } from "#/ui/cn";
import { Tooltip } from "#/ui/tooltip";
import { formatDuration } from "#src/features/traces/duration";
import { StepPlaces } from "#src/features/traces/transcript";
import type { Span, Turn } from "#src/sdk/agents";

// a turn that ran for a moment still takes a click
const SEGMENT = "min-w-2 basis-0";
const NANOS_PER_MILLI = 1e6;

/** A session's turns over time, open turns in the accent, failing turns tinted red with a tick at each failing step, and each turn's number under it. */
export function TurnsTimeline({
  turns,
  failed,
  open,
  onPick,
}: {
  turns: readonly Turn[];
  failed: ReadonlySet<string>;
  open: ReadonlySet<string>;
  onPick(span: Span): void;
}) {
  if (turns.length < 2) {
    return (
      <SpanTimeline traces={turns.map(({ spans }) => spans)} failed={failed} onPick={onPick} />
    );
  }
  const total = turns.reduce((sum, turn) => sum + turn.duration_ns, 0);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <div role="group" aria-label="Timeline" className="flex h-2 gap-1">
        {turns.map((turn) => (
          <TurnSegment
            key={turn.trace_id}
            turn={turn}
            failed={failed}
            open={open.has(turn.trace_id)}
            onPick={onPick}
          />
        ))}
      </div>
      <span />
      <div aria-hidden="true" className="flex gap-1 type-meta-12 text-muted tabular-nums">
        {turns.map((turn) => (
          <span
            key={turn.trace_id}
            style={{ flexGrow: turn.duration_ns }}
            className={cn(SEGMENT, "@container overflow-hidden whitespace-nowrap")}
          >
            {/* a segment too narrow for its number leaves it to the segment's tooltip */}
            <span className="hidden @min-[1rem]:inline">{turn.position}</span>
          </span>
        ))}
      </div>
      <Tooltip label="Time in turns, the pauses between them left out">
        <span tabIndex={0} className="type-meta-12 text-muted tabular-nums">
          {formatDuration(total)}
        </span>
      </Tooltip>
    </div>
  );
}

function TurnSegment({
  turn,
  failed,
  open,
  onPick,
}: {
  turn: Turn;
  failed: ReadonlySet<string>;
  open: boolean;
  onPick(span: Span): void;
}) {
  const root = turn.spans.find((span) => span.parent_span_id === "");
  const place = use(StepPlaces);
  const start = Date.parse(root?.started_at ?? turn.started_at);
  const ticks = turn.spans.filter((span) => failed.has(span.span_id));
  const tools = turn.spans.filter((span) => spanKind(span) === "tool").length;
  const label = [
    `Turn ${turn.position}`,
    formatDuration(turn.duration_ns),
    counted(tools, "tool calls"),
    ...(ticks.length > 0 ? [counted(ticks.length, "failing steps")] : []),
  ].join(", ");
  return (
    <div style={{ flexGrow: turn.duration_ns }} className={cn(SEGMENT, "relative")}>
      <Tooltip label={label}>
        <button
          type="button"
          tabIndex={-1}
          aria-label={label}
          onClick={() => root && onPick(root)}
          className={cn(
            "absolute inset-0 rounded-xs hover:brightness-90",
            open ? "bg-accent/50" : ticks.length > 0 ? "bg-danger-tint" : "bg-divider",
          )}
        />
      </Tooltip>
      {ticks.map((span) => {
        const at =
          ((Date.parse(span.started_at) - start) * NANOS_PER_MILLI) / Math.max(turn.duration_ns, 1);
        const tick = `${place(span.span_id) ?? spanLabel(span)}, ${formatDuration(span.duration_ns)}, failed`;
        return (
          <Tooltip key={span.span_id} label={tick}>
            <button
              type="button"
              tabIndex={-1}
              aria-label={tick}
              onClick={() => onPick(span)}
              style={{ left: `min(${Math.min(Math.max(at, 0), 1) * 100}%, calc(100% - 0.25rem))` }}
              className="absolute inset-y-0 w-1 rounded-xs bg-danger hover:brightness-90"
            />
          </Tooltip>
        );
      })}
    </div>
  );
}
