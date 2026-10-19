// every Walkthrough of every Agent played at full speed, with each beat's target found on its page; a beat the player
// showed as missing, gave up on or skipped over is listed by step and target
import { expect, type Page, test } from "@playwright/test";
import { z } from "zod";

import { walkthroughsSchema, type WalkthroughTarget } from "#src/demo/plane/seed/walkthroughs";
import { AGENTS, readScenario } from "#test/scenarios";

const Schema = walkthroughsSchema(z.unknown());
type Walkthrough = z.infer<typeof Schema>["walkthroughs"][number];

test.describe.configure({ mode: "parallel" });

const PLAYS = AGENTS.flatMap(({ agentId }) =>
  Schema.parse(readScenario(`${agentId}/walkthroughs.json`))
    .walkthroughs.filter(({ unavailable }) => unavailable === undefined)
    .map((walkthrough) => ({ agentId, walkthrough })),
);

const card = (page: Page) =>
  page.getByRole("dialog", { name: "Walkthrough step", includeHidden: true });

// each beat and phase the card shows, so a beat shown for a moment is still seen
async function watchBeats(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: string[] = [];
    Object.assign(window, { beatLog: log });
    new MutationObserver(() => {
      const shown = document.querySelector<HTMLElement>("[data-walkthrough-card]");
      const skipped = shown?.textContent?.includes("Skipped a step") === true;
      const entry = `${shown?.dataset["beat"]} ${shown?.dataset["phase"]} ${skipped}`;
      if (shown !== null && log.at(-1) !== entry) {
        log.push(entry);
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-beat", "data-phase"],
    });
  });
}

const describe = ({ role, name, within }: WalkthroughTarget): string =>
  `${role} "${name}"${within === undefined ? "" : ` in ${describe(within)}`}`;

const order = (key: string) =>
  key
    .split(":")
    .map(Number)
    .reduce((step, beat) => step * 100 + beat);

// the beats whose target the player never found: one it showed as missing, the one it gave up on before skipping to a
// later step (the card then reads Skipped a step), and every beat it skipped over
function missed(walkthrough: Walkthrough, log: string[]): string[] {
  const entries = log.map((line) => {
    const [key = "", phase = "", skipped = ""] = line.split(" ");
    return { key, phase, skipped: skipped === "true" };
  });
  const lost = new Set<number>();
  for (const [index, entry] of entries.entries()) {
    const before = entries[index - 1];
    if (entry.phase === "missing") {
      lost.add(order(entry.key));
    }
    if (entry.skipped && before !== undefined && !before.skipped && before.key !== entry.key) {
      for (let at = order(before.key); at < order(entry.key); at++) {
        lost.add(at);
      }
    }
  }
  const reached = Math.max(...entries.map(({ key }) => (key === "undefined" ? -1 : order(key))));
  return walkthrough.steps.flatMap((step, at) =>
    step.beats.flatMap((beat, index) => {
      const key = at * 100 + index;
      return lost.has(key) || key > reached
        ? [`step ${at + 1} beat ${index + 1}: ${describe(beat.target)}`]
        : [];
    }),
  );
}

for (const { agentId, walkthrough } of PLAYS) {
  test(`${agentId} ${walkthrough.name} finds every target`, async ({ page }) => {
    test.setTimeout(300_000);
    await watchBeats(page);
    await page.goto(`/demo/agents/${agentId}/issues`);
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("combobox").fill(walkthrough.name);
    await page
      .getByRole("group", { name: /^(Primary|Features)$/u })
      .getByRole("option", { name: walkthrough.name, exact: true })
      .click();
    const shown = card(page);
    await expect(shown).toBeVisible();
    await shown.getByRole("button", { name: /^Step \d+ of \d+, speed/u }).click();
    await page.getByRole("menuitemradio", { name: "3×", exact: true }).click();
    // the pointer on the card holds it
    await page.mouse.move(0, 0);

    // Next on a shown beat, Skip on a missing one, until the card closes
    await expect(async () => {
      if ((await shown.count()) === 0) {
        return;
      }
      const phase = await shown.getAttribute("data-phase", { timeout: 1000 });
      const done = shown.getByRole("button", { name: "Done", exact: true });
      if (phase === "showing" && (await done.count()) > 0) {
        await done.dispatchEvent("click");
      } else if (phase === "showing" || phase === "missing") {
        await page.keyboard.press("ArrowRight");
      }
      await expect(shown).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 280_000, intervals: [700] });

    const log = z
      .array(z.string())
      .parse(await page.evaluate(() => Reflect.get(window, "beatLog")));
    const beats = walkthrough.steps.reduce((sum, { beats: each }) => sum + each.length, 0);
    const misses = missed(walkthrough, log);
    test.info().annotations.push({
      type: "targets",
      description: `${beats - misses.length} of ${beats} found`,
    });
    expect(misses).toEqual([]);
  });
}
