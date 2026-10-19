import { expect, test } from "vitest";

import { formatDuration } from "./duration.ts";

test.each([
  [20_000, "20 µs"],
  [130_000_000, "130 ms"],
  [999_700_000, "1.0 s"],
  [9_840_000_000, "9.8 s"],
  [59_970_000_000, "1m 0s"],
  [132_070_000_000, "2m 12s"],
  [2_694_930_000_000, "44m 55s"],
  [3_840_000_000_000, "1h 4m"],
])("%d ns reads as %s", (nanos, text) => {
  expect(formatDuration(nanos)).toBe(text);
});
