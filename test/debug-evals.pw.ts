// the Debug Evals Walkthrough on the Unity seed, played on its own: an Eval edited in Debug Evals, then the Candidates
// rerun on it to fresh results, with every beat finding its control
import { expect, test } from "@playwright/test";

test("Debug Evals plays from the edit to fresh Candidate results", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/demo/agents/unity-ai/issues");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox").fill("Debug Evals");
  await page.getByRole("option", { name: /^Debug Evals/u }).click();

  const card = page.getByRole("dialog", { name: "Walkthrough step" });
  await expect(card).toBeVisible();
  // a step that cannot find its control offers Skip, so the Walkthrough reaching Done with none means every beat played
  const skip = card.getByRole("button", { name: "Skip", exact: true });
  const done = card.getByRole("button", { name: "Done", exact: true });
  await expect(async () => {
    await expect(skip).toHaveCount(0);
    await expect(done).toBeVisible();
  }).toPass({ timeout: 200_000, intervals: [1000] });
  await expect(page.getByRole("table", { name: "Candidates" })).not.toContainText("Out of date");
});
