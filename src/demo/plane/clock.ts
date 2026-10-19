import type { Trace } from "#src/sdk/index";

import { jobToml } from "./paths.ts";
import type { Seed } from "./seed/types.ts";

// the nightly jobs' calendar zone
export const ZONE = "America/Los_Angeles";
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
const SETTLE_MS = 10 * 60_000;

// one wall clock for schedules and the seed move, so DST is settled the same way everywhere
const WALL = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: ZONE,
});

/** The zone's wall clock at an instant to the second, read back as if it were UTC ("2026-10-02 14:05:32" in Swedish). */
const wall = (at: number) => Date.parse(`${WALL.format(at).replace(" ", "T")}Z`);

// as generated seed records print it
export function isoSeconds(at: number): string {
  return new Date(at).toISOString().replace(/\.\d{3}Z$/u, "Z");
}

/** The zone's calendar day a time falls on, as that date's UTC midnight. */
export const localDay = (at: number): number => Math.floor(wall(at) / DAY_MS) * DAY_MS;

/** When a daily cron ("M H * * *") fires on a local day, with a second pass for the offset in force across a DST change. */
export function cronAt(cron: string, day: number): number {
  const [minute = 0, hour = 0] = cron.split(" ").map(Number);
  const local = day + (hour * 60 + minute) * 60_000;
  const guess = local - (wall(local) - local);
  return local - (wall(guess) - guess);
}

/** The newest git, pull or Trace time shared by generation and playback. */
export function latestRecorded({
  repo,
  pulls,
  traces,
}: {
  repo: { commits: Readonly<Record<string, { committer: { date: string } }>> };
  pulls: ReadonlyArray<{ updated_at: string }>;
  traces: ReadonlyArray<Pick<Trace, "spans">>;
}): number {
  return Math.max(
    ...Object.values(repo.commits).map((commit) => Date.parse(commit.committer.date)),
    ...pulls.map((pull) => Date.parse(pull.updated_at)),
    ...traces.flatMap((trace) => trace.spans.map((span) => Date.parse(span.started_at))),
  );
}

// the seed's days line up on this loop's newest run
const LOOP = new Set(["annotate-traces", "grounded/match-issues", "mine-issues"]);

// keeps a seed time's sub-second digits
const plus = (delta: number) => (iso: string) =>
  `${new Date(Date.parse(`${iso.slice(0, 19)}Z`) + delta).toISOString().slice(0, 19)}${iso.slice(19)}`;

const maybe = (move: (iso: string) => string) => (iso: string | null) =>
  iso === null ? null : move(iso);

// a cron weekday field's days with 7 read as Sunday, or null when it does not parse
function cronWeekdays(text: string): number[] | null {
  const values: number[] = [];
  for (const part of text.split(",")) {
    const match = /^(?:\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/u.exec(part);
    if (match === null) {
      return null;
    }
    const [, start, end, step] = match;
    const from = start === undefined ? 0 : Number(start);
    const to =
      end !== undefined ? Number(end) : start === undefined || step !== undefined ? 7 : from;
    const every = Number(step ?? 1);
    if (to > 7 || from > to || every < 1) {
      return null;
    }
    for (let value = from; value <= to; value += every) {
      values.push(value % 7);
    }
  }
  return values;
}

// the fields of the first cron in a job's job.toml on main
function cronOf({ repo }: Seed, job: string): string[] {
  let sha = repo.commits[repo.refs["refs/heads/main"] ?? ""]?.tree;
  for (const name of jobToml(job).split("/")) {
    sha = repo.trees[sha ?? ""]?.find((entry) => entry.name === name)?.sha;
  }
  return /cron = "([^"]+)"/u.exec(repo.blobs[sha ?? ""] ?? "")?.[1]?.split(" ") ?? [];
}

// the hours between runs of a cron that runs every hour or every few hours on every day, or null
function hoursOf(cron: readonly string[]): number | null {
  const [minute = "", hour = "", ...days] = cron;
  const step = hour === "*" ? 1 : Number(/^\*\/(\d+)$/u.exec(hour)?.[1]);
  return /^\d+$/u.test(minute) &&
    days.length === 3 &&
    days.every((field) => field === "*") &&
    24 % step === 0
    ? step
    : null;
}

// null when the job runs every day
function cronDays(cron: readonly string[]): Set<number> | null {
  const field = cron[4];
  return field === undefined || field === "*" ? null : new Set(cronWeekdays(field));
}

// a time's UTC weekday, where 1970-01-01 was a Thursday
const weekday = (time: number) => (Math.floor(time / DAY_MS) + 4) % 7;

/** The seed moved to now plus the move for git's hashed dates. Scheduled runs move by whole UTC days, so they keep their
 * UTC crons and weekdays across daylight saving as platform reads them, or by whole steps of an hourly cron, and what
 * the seed did after the nightly loop spreads out or squeezes in to end shortly before now. */
export function rebased(source: Seed, now: number): { seed: Seed; at: (iso: string) => string } {
  const loop = source.runs.flatMap((run) =>
    run.trigger === "schedule" && LOOP.has(run.job) ? [Date.parse(run.created_at)] : [],
  );
  // the newest conversation, commit, pull or triggered run; scheduled runs keep their cron times
  const latest = Math.max(
    ...source.runs.flatMap((run) =>
      run.trigger === "schedule" ? [] : [Date.parse(run.completed_at ?? run.created_at)],
    ),
    latestRecorded(source),
  );
  // an hour covers a conversation's last spans, and anything later is the viewer's
  const end = latest + HOUR_MS;
  const anchor = Math.max(...loop);
  const days = loop.length === 0 ? 0 : Math.floor((now - anchor) / DAY_MS);
  if (days <= 0) {
    return { seed: source, at: (iso) => iso };
  }
  const offset = days * DAY_MS;
  // the latest activity lands at the last whole 10 minutes, so its times hold still while the demo is open
  const settled = Math.floor(now / SETTLE_MS) * SETTLE_MS;
  const scale = Math.max(0, (settled - anchor - offset) / Math.max(1, latest - anchor));
  const delta = (time: number) =>
    time <= anchor
      ? offset
      : Math.round(((Math.min(time, latest) - anchor) * (scale - 1)) / 1000) * 1000 + offset;
  const at = (iso: string) => {
    const time = Date.parse(iso);
    return time <= end ? plus(delta(time))(iso) : iso;
  };
  const crons = new Map(source.runs.map((run) => [run.job, cronOf(source, run.job)]));
  const weekdays = new Map([...crons].map(([job, cron]) => [job, cronDays(cron)]));
  // a job that runs every hour or every few hours moves by whole steps of its cron, its newest run landing in the last
  // step before now, so a 6-hourly spot check has run within 6 hours whatever the time of day
  const periodic = new Map<string, number>();
  for (const run of source.runs) {
    const step = hoursOf(crons.get(run.job) ?? []);
    if (run.trigger === "schedule" && step !== null && !LOOP.has(run.job)) {
      const late =
        Math.floor((now - Date.parse(run.created_at) - offset) / (step * HOUR_MS)) * step * HOUR_MS;
      periodic.set(run.job, Math.max(0, Math.min(periodic.get(run.job) ?? late, late)));
    }
  }
  const runs = source.runs.flatMap((run) => {
    const scheduled = run.trigger === "schedule";
    const created = Date.parse(run.created_at);
    const stepped = periodic.get(run.job);
    const shift = stepped !== undefined ? offset + stepped : scheduled ? offset : delta(created);
    const move = plus(shift);
    const due = created + shift;
    if (scheduled && (due > now || !(weekdays.get(run.job)?.has(weekday(due)) ?? true))) {
      return [];
    }
    return [
      {
        ...run,
        created_at: move(run.created_at),
        started_at: maybe(move)(run.started_at),
        completed_at: maybe(move)(run.completed_at),
        cleaned_at: maybe(move)(run.cleaned_at),
        cancel_requested_at: maybe(move)(run.cancel_requested_at),
        trials: run.trials?.map((trial) => ({
          ...trial,
          started_at: move(trial.started_at),
          finished_at: move(trial.finished_at),
        })),
      },
    ];
  });
  // a Trace's spans move together, so its steps keep their durations
  const moved = (trace: Trace): Trace => {
    const move = plus(delta(Math.min(...trace.spans.map((span) => Date.parse(span.started_at)))));
    return {
      ...trace,
      spans: trace.spans.map((span) => ({ ...span, started_at: move(span.started_at) })),
    };
  };
  const { loadTrace } = source;
  return {
    at,
    seed: {
      ...source,
      runs,
      pulls: source.pulls.map((pull) => ({
        ...pull,
        created_at: at(pull.created_at),
        updated_at: at(pull.updated_at),
        closed_at: maybe(at)(pull.closed_at),
        merged_at: maybe(at)(pull.merged_at),
      })),
      traces: source.traces.map(moved),
      loadTrace:
        loadTrace === undefined
          ? undefined
          : async (id) => {
              const trace = await loadTrace(id);
              return trace === undefined ? undefined : moved(trace);
            },
    },
  };
}
