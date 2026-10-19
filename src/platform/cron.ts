import cronstrue from "cronstrue";

const MINUTES_PER_DAY = 24 * 60;

/** A cron schedule in words in the viewer's time zone, such as `At 08:00 PM, every day`, or in UTC when it can't be shifted exactly. */
export function describeSchedule(cron: string) {
  const local = cronInViewerZone(cron);
  const words = (expression: string) =>
    cronstrue.toString(expression, { verbose: /^\d+\s+\d+\s/.test(expression), use24HourTimeFormat: true });
  return local === undefined ? `${words(cron)} UTC` : words(local);
}

/** A schedule in a few words, such as `Daily 20:00` or `Hourly`, in the viewer's time zone. */
export function shortSchedule(cron: string) {
  const local = cronInViewerZone(cron);
  const [minute = "", hour = "", dayOfMonth, month, dayOfWeek] = (local ?? cron).split(/\s+/);
  const daily = dayOfMonth === "*" && month === "*" && dayOfWeek === "*";
  if (!daily || !/^\d+$/.test(minute)) {
    return "Custom";
  }
  if (/^\d+$/.test(hour)) {
    return `Daily ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}${local === undefined ? " UTC" : ""}`;
  }
  if (hour === "*") {
    return "Hourly";
  }

  const every = /^\*\/(\d+)$/.exec(hour)?.[1];
  return every === undefined ? "Custom" : `Every ${every}h`;
}

function cronInViewerZone(cron: string) {
  const [minute = "", hour = "", dayOfMonth = "", month = "", dayOfWeek = "", ...rest] = cron
    .trim()
    .split(/\s+/);
  const offset = -new Date().getTimezoneOffset();
  if (rest.length > 0) {
    return undefined;
  }
  if (!/^\d+$/.test(hour)) {
    return hour === "*" && (offset % 60 === 0 || !/^\d+$/.test(minute)) ? cron : undefined;
  }
  if (!/^\d+$/.test(minute)) {
    return undefined;
  }

  const at = Number(hour) * 60 + Number(minute) + offset;
  const dayShift = Math.floor(at / MINUTES_PER_DAY);
  const local = at - dayShift * MINUTES_PER_DAY;
  const days = dayShift === 0 || dayOfWeek === "*" ? dayOfWeek : shiftDays(dayOfWeek, dayShift);
  if (days === undefined || (dayShift !== 0 && (dayOfMonth !== "*" || month !== "*"))) {
    return undefined;
  }
  return [local % 60, Math.floor(local / 60), dayOfMonth, month, days].join(" ");
}

function shiftDays(field: string, shift: number) {
  if (!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(field)) {
    return undefined;
  }
  const days = field
    .split(",")
    .flatMap((part) => {
      const [start = 0, end = start] = part.split("-").map(Number);
      return Array.from({ length: end - start + 1 }, (_, i) => (start + i + shift + 14) % 7);
    })
    .sort((a, b) => a - b);
  const first = days[0];
  const last = days.at(-1);
  return days.length > 2 && first !== undefined && last === first + days.length - 1
    ? `${first}-${last}`
    : days.join(",");
}
