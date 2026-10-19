// the trace viewer's durations in units read at a glance (platform's "2694.93 s" asks for mental math); suggested for
// platform's formatDuration in PR 3, which would change every duration in the app
const NANOS_PER_MICRO = 1e3;
const NANOS_PER_MILLI = 1e6;
const NANOS_PER_TENTH = 1e8;
const NANOS_PER_SECOND = 1e9;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const TENTHS_PER_MINUTE = 600;
const MILLIS_PER_SECOND = 1000;

/** A duration as `20 µs`, `130 ms`, `9.8 s`, `2m 12s` or `1h 4m`. */
export function formatDuration(nanos: number) {
  if (nanos < NANOS_PER_MILLI) {
    return `${Math.round(nanos / NANOS_PER_MICRO)} µs`;
  }
  const millis = Math.round(nanos / NANOS_PER_MILLI);
  if (millis < MILLIS_PER_SECOND) {
    return `${millis} ms`;
  }
  const tenths = Math.round(nanos / NANOS_PER_TENTH);
  if (tenths < TENTHS_PER_MINUTE) {
    return `${(tenths / 10).toFixed(1)} s`;
  }
  const seconds = Math.round(nanos / NANOS_PER_SECOND);
  if (seconds < SECONDS_PER_HOUR) {
    return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m ${seconds % SECONDS_PER_MINUTE}s`;
  }
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
  return `${Math.floor(minutes / SECONDS_PER_MINUTE)}h ${minutes % SECONDS_PER_MINUTE}m`;
}
