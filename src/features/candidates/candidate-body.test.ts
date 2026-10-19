import { describe, expect, it } from "vitest";

import { splitApplyPrompt } from "#src/features/candidates/candidate-body";

describe("splitApplyPrompt", () => {
  it("parts the rationale from the prompt", () => {
    expect(
      splitApplyPrompt(
        "Checks writes.\n\n<ApplyPrompt>\nApply this Fix.\n\n- a.ts\n</ApplyPrompt>\n",
      ),
    ).toEqual({ rationale: "Checks writes.", prompt: "Apply this Fix.\n\n- a.ts" });
  });

  it("keeps a body without a prompt whole", () => {
    expect(splitApplyPrompt("Checks writes.\n")).toEqual({
      rationale: "Checks writes.",
      prompt: undefined,
    });
  });

  it("leaves an empty prompt in the rationale, as the Markdown renders it", () => {
    expect(splitApplyPrompt("A\n<ApplyPrompt></ApplyPrompt>")).toEqual({
      rationale: "A\n<ApplyPrompt></ApplyPrompt>",
      prompt: undefined,
    });
  });
});
