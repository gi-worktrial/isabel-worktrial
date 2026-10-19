// platform's Timestamp with the day or time alone, for a short column or a board card (Krish: shorter Automations
// table, Feebs: a card's time too granular)
import { formatExact, formatTime } from "#/ui/format";
import { Tooltip } from "#/ui/tooltip";

const SHORT_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function duration(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

/** A moment as its time today (`02:10`), its day this year (`Oct 14`), or its date before (`Oct 14, 2025`). */
export function shortTime(at: string, now: number = Date.now()): string {
  const day = new Date(at);
  const today = new Date(now);
  if (day.toDateString() === today.toDateString()) {
    return formatTime(at);
  }
  return (day.getFullYear() === today.getFullYear() ? SHORT_DAY : SHORT_DATE).format(day);
}

/** A past moment as a compact elapsed duration without “ago”, such as `2 hours` or `3 weeks`. */
export function relativeTime(at: string, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - Date.parse(at));
  if (elapsed < HOUR) {
    return duration(Math.max(1, Math.floor(elapsed / MINUTE)), "minute");
  }
  if (elapsed < DAY) {
    return duration(Math.floor(elapsed / HOUR), "hour");
  }
  if (elapsed < WEEK) {
    return duration(Math.floor(elapsed / DAY), "day");
  }
  if (elapsed < 2 * MONTH) {
    return duration(Math.floor(elapsed / WEEK), "week");
  }
  if (elapsed < YEAR) {
    return duration(Math.floor(elapsed / MONTH), "month");
  }
  return duration(Math.floor(elapsed / YEAR), "year");
}

// raised over a table row's link, as platform's Timestamp is, so its tooltip with the exact moment opens on hover
export function ShortTimestamp({ at, relative = false }: { at: string; relative?: boolean }) {
  return (
    <Tooltip label={formatExact(at)}>
      <time dateTime={at} className="relative z-10 whitespace-nowrap tabular-nums">
        {relative ? relativeTime(at) : shortTime(at)}
      </time>
    </Tooltip>
  );
}
