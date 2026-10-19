// our formats beside platform's ui/format.ts, a moment to the second, its short day and short text

const TIMESTAMP_SECONDS = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// platform's formatTimestamp with seconds, for a span's details and events, "Oct 01 14:05:32"
export function formatTimestampSeconds(at: string): string {
  return TIMESTAMP_SECONDS.format(new Date(at)).replace(",", "");
}

const SHORT_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" });

// a moment's day as platform's formatTimestamp starts it, "Oct 01"
export function formatShortDay(at: string): string {
  return SHORT_DAY.format(new Date(at));
}

// fits within limit, the dots included
export function clipped(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 3).trimEnd()}...`;
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
