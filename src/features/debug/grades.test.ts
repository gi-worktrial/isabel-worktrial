import { describe, expect, it } from "vitest";

import { gradeOutcomes } from "./grades.ts";

const trial = (...labels: Array<[string, string]>) => ({
  annotations: labels.map(([name, label]) => ({ name, label })),
});

describe("gradeOutcomes", () => {
  it("fails a criterion any trial fails, lists failures first, and skips the trial's reward, scores and other annotations", () => {
    expect(
      gradeOutcomes([
        trial(
          ["grounded/grade/reward", "pass"],
          ["grounded/grade/tone", "pass"],
          ["grounded/grade/format", "pass"],
        ),
        trial(
          ["grounded/grade/tone", "fail"],
          ["grounded/grade/format", "pass"],
          ["grounded/grade/likert", "4"],
          ["grounded/issue/ISS-1", "match"],
        ),
      ]),
    ).toEqual([
      { criterion: "tone", passed: false },
      { criterion: "format", passed: true },
    ]);
  });
});
