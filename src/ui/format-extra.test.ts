// platform's formats (a copy in src/platform/ui/format.ts), then our extras
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test.each([
  {
    zone: "Asia/Tokyo",
    day: "Thu, Oct 1, 2026",
    stamp: "Oct 01 09:15",
    time: "09:15",
    exact: "2026-10-01 09:15:07 GMT+9",
  },
  {
    zone: "America/Los_Angeles",
    day: "Wed, Sep 30, 2026",
    stamp: "Sep 30 17:15",
    time: "17:15",
    exact: "2026-09-30 17:15:07 PDT",
  },
])("dates use the viewer's timezone ($zone)", async ({ zone, day, stamp, time, exact }) => {
  vi.stubEnv("TZ", zone);
  vi.resetModules();
  const { formatDay, formatExact, formatTime, formatTimestamp } = await import("#/ui/format");
  const { formatShortDay, formatTimestampSeconds } = await import("./format-extra.ts");
  const at = "2026-10-01T00:15:07Z";
  expect(formatDay(at)).toBe(day);
  expect(formatTime(at)).toBe(time);
  expect(formatTimestamp(at)).toBe(stamp);
  expect(formatTimestampSeconds(at)).toBe(`${stamp}:07`);
  expect(formatShortDay(at)).toBe(stamp.slice(0, 6));
  expect(formatExact(at)).toBe(exact);
});

test("midnight reads as 00, never 24", async () => {
  vi.stubEnv("TZ", "UTC");
  vi.resetModules();
  const { formatTime } = await import("#/ui/format");
  expect(formatTime("2026-10-01T00:05:00Z")).toBe("00:05");
});

test("a duration from nanoseconds reads in µs, ms or seconds", async () => {
  const { formatDuration } = await import("#/ui/format");
  expect(formatDuration(1_500)).toBe("2 µs");
  expect(formatDuration(343_400_000)).toBe("343.4 ms");
  expect(formatDuration(6_000_000_000)).toBe("6.00 s");
  expect(formatDuration(62_000_000_000)).toBe("62.00 s");
});
