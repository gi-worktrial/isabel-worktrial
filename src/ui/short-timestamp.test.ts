import { describe, expect, it } from "vitest";

import { relativeTime, shortTime } from "./short-timestamp.tsx";

describe("shortTime", () => {
  const now = new Date(2026, 9, 15, 12, 0).getTime();

  it("reads today's moment as its time", () => {
    expect(shortTime(new Date(2026, 9, 15, 2, 10).toISOString(), now)).toBe("02:10");
  });

  it("reads an earlier day's moment as its day", () => {
    expect(shortTime(new Date(2026, 9, 14, 23, 50).toISOString(), now)).toBe("Oct 14");
  });

  it("reads a moment from an earlier year with its year", () => {
    expect(shortTime(new Date(2025, 9, 14, 9, 0).toISOString(), now)).toBe("Oct 14, 2025");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-10-18T20:00:00Z").getTime();

  it.each([
    ["2026-10-18T17:30:00Z", "2 hours"],
    ["2026-10-16T12:00:00Z", "2 days"],
    ["2026-09-30T12:00:00Z", "2 weeks"],
  ])("reads %s as %s", (at, expected) => {
    expect(relativeTime(at, now)).toBe(expected);
  });
});
