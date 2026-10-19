const TIMESTAMP = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const EXACT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "short",
});

const RELATIVE = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
const SECONDS_PER_MINUTE = 60;
const RELATIVE_UNITS = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", SECONDS_PER_MINUTE],
] as const;

const AGE_UNITS = [
  ["y", 365 * 24 * 60 * 60],
  ["d", 24 * 60 * 60],
  ["h", 60 * 60],
  ["m", SECONDS_PER_MINUTE],
] as const;

const NANOS_PER_SECOND = 1e9;
const NANOS_PER_MILLI = 1e6;
const NANOS_PER_MICRO = 1e3;

/** A moment in the viewer's zone, such as `Oct 01 14:05`. */
export function formatTimestamp(at: string) {
  return TIMESTAMP.format(new Date(at)).replace(",", "");
}

/** The day of a moment in the viewer's zone, such as `Thu, Oct 1, 2026`. */
export function formatDay(at: string) {
  return DAY.format(new Date(at));
}

/** The time of day of a moment in the viewer's zone, such as `14:05`. */
export function formatTime(at: string) {
  return TIME.format(new Date(at));
}

/** The exact moment for tooltips, such as `2026-10-01 14:05:32 PDT`. */
export function formatExact(at: string) {
  const parts = Object.fromEntries(
    EXACT.formatToParts(new Date(at)).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}`;
}

/** How long before `now` a moment was, such as `just now`, `1 minute ago`, or `yesterday`. */
export function formatRelative(at: string, now: number) {
  const seconds = (new Date(at).getTime() - now) / 1000;
  const match = RELATIVE_UNITS.find(([, size]) => Math.abs(seconds) >= size);
  if (match === undefined) {
    return "just now";
  }

  const [unit, size] = match;
  return RELATIVE.format(Math.trunc(seconds / size), unit);
}

/** How long before `now` a moment was, in its largest whole unit, such as `now`, `5m`, `3h`, or `17d`. */
export function formatAge(at: string, now: number) {
  const seconds = (now - new Date(at).getTime()) / 1000;
  const match = AGE_UNITS.find(([, size]) => seconds >= size);
  if (match === undefined) {
    return "now";
  }

  const [unit, size] = match;
  return `${Math.floor(seconds / size)}${unit}`;
}

export function formatDuration(nanos: number) {
  if (nanos >= NANOS_PER_SECOND) {
    return `${(nanos / NANOS_PER_SECOND).toFixed(2)} s`;
  }
  if (nanos >= NANOS_PER_MILLI) {
    return `${(nanos / NANOS_PER_MILLI).toFixed(1)} ms`;
  }

  return `${Math.round(nanos / NANOS_PER_MICRO)} µs`;
}

/** Text on one line, each run of whitespace a single space. */
export function flat(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
