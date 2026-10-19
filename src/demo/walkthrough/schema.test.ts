import { expect, test } from "vitest";

import { targetProblems, WALKTHROUGH_IDS } from "#src/demo/plane/seed/walkthroughs";
import {
  requestedIds,
  walkthroughGroupLabel,
  walkthroughHoldMs,
  walkthroughOffers,
  WalkthroughsSchema,
} from "#src/demo/walkthrough/state";
import { AGENTS, readScenario } from "#test/scenarios";

test.each(AGENTS.map((agent) => agent.agentId))(
  "%s's walkthroughs.json parses and has valid role selectors",
  (agentId) => {
    const { agent, groups, timing, walkthroughs } = WalkthroughsSchema.parse(
      readScenario(`${agentId}/walkthroughs.json`),
    );
    expect(agent.agentId).toBe(agentId);
    expect(groups).toEqual([
      { id: "story", label: "Primary" },
      { id: "features", label: "Features" },
    ]);
    expect(timing).toEqual({ captionMinMs: 2500, wordMs: 300, preparationMs: 800, restMs: 2000 });
    expect(walkthroughs.map(({ id }) => id)).toEqual(
      WALKTHROUGH_IDS.filter((id) => walkthroughs.some((each) => each.id === id)),
    );
    for (const { steps } of walkthroughs) {
      for (const { beats } of steps) {
        expect(
          beats
            .flatMap(({ target, reveal }) => [target, ...(reveal === undefined ? [] : [reveal])])
            .flatMap(targetProblems),
        ).toEqual([]);
      }
    }
  },
);

test("malformed names, display selectors and ancestor selectors are rejected", () => {
  expect(targetProblems({ role: "button", name: "/^Show files$/" })).toEqual([]);
  expect(targetProblems({ role: "button", name: "/[/" })).toEqual([
    'button "/[/" has an invalid name selector',
  ]);
  expect(targetProblems({ role: "button", name: "Show files", shows: "[" })).toEqual([
    'button "Show files" has an invalid display selector',
  ]);
  expect(
    targetProblems({ role: "button", name: "Show files", within: { role: "region", name: "/[/" } }),
  ).toEqual(['region "/[/" has an invalid name selector']);
});

test("a caption holds 300 ms a word, never under 2.5 s, divided by the speed", () => {
  const timing = { captionMinMs: 2500, wordMs: 300, preparationMs: 800, restMs: 2000 };
  expect(walkthroughHoldMs("one two three", 1, timing)).toBe(2500);
  expect(walkthroughHoldMs(Array.from({ length: 15 }, () => "word").join(" "), 1, timing)).toBe(
    4500,
  );
  expect(walkthroughHoldMs(Array.from({ length: 15 }, () => "word").join(" "), 2, timing)).toBe(
    2250,
  );
});

test("the hold and group label come from authored metadata", () => {
  const timing = { captionMinMs: 1000, wordMs: 400, preparationMs: 200, restMs: 500 };
  expect(walkthroughHoldMs("one two three", 1.5, timing)).toBe(800);
  expect(walkthroughHoldMs("one", 2, timing)).toBe(500);
  expect(
    walkthroughGroupLabel({ groups: [{ id: "story", label: "Authored group" }] }, "story"),
  ).toBe("Authored group");
});

test.each(AGENTS.map((agent) => agent.agentId))("%s's Play all retains plan order", (agentId) => {
  const plans = WalkthroughsSchema.parse(readScenario(`${agentId}/walkthroughs.json`));
  for (const { id } of plans.groups) {
    // a presenter's Walkthrough holds each caption for Next, so Play all leaves it out
    const expected = plans.walkthroughs.filter(
      (plan) => plan.group === id && plan.unavailable === undefined && plan.waits !== true,
    );
    expect(requestedIds(walkthroughOffers(plans), id)).toEqual(expected.map((plan) => plan.id));
  }
});
