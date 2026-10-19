// platform's cron.ts with our patch for the 24-hour clock (scripts/platform-web/patches/cron.ts.patch)
import { afterEach, describe, expect, it, vi } from "vitest";

import { describeSchedule } from "#/cron";

// minutes west of UTC, as Date#getTimezoneOffset reports them
const inZone = (offset: number) =>
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(offset);

describe("describeSchedule", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads a daily time on the viewer's 24-hour clock", () => {
    inZone(0);
    expect(describeSchedule("0 3 * * *")).toBe("At 03:00, every day");
    inZone(420);
    expect(describeSchedule("0 3 * * *")).toBe("At 20:00, every day");
  });

  it("moves weekdays with the time when it crosses midnight", () => {
    inZone(420);
    expect(describeSchedule("0 6 * * 1")).toBe("At 23:00, only on Sunday");
    expect(describeSchedule("0 3 * * 1-5")).toBe("At 20:00, Sunday through Thursday");
  });

  it("keeps UTC when a shift can't be exact", () => {
    inZone(330);
    expect(describeSchedule("0 */6 * * *")).toBe("At 0 minutes past the hour, every 6 hours UTC");
    inZone(420);
    expect(describeSchedule("0 3 1 * *")).toBe("At 03:00, on day 1 of the month UTC");
  });
});
