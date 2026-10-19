// the presenter's Demo call on the Unity seed, stepped with the arrow key as on a live call, with every beat finding its
// control and the Issue shipped at the end
import { expect, test } from "@playwright/test";

test("the Demo call plays every step on Unity and ends with the Issue resolved", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/demo/agents/unity-ai/issues");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox").fill("Demo call");
  await page.getByRole("option", { name: /Demo call/u }).click();

  const card = page.getByRole("dialog", { name: "Walkthrough step" });
  const counter = card.getByRole("button", { name: /^Step \d+ of \d+/u });
  const done = card.getByRole("button", { name: "Done", exact: true });
  const stepOf = async () =>
    Number(/^Step (\d+)/u.exec((await counter.getAttribute("aria-label")) ?? "")?.[1]);
  await expect(counter).toHaveAttribute("aria-label", /^Step 1 of \d+/u);
  const steps = Number(/of (\d+)/u.exec((await counter.getAttribute("aria-label")) ?? "")?.[1]);
  for (let step = 1; step < steps; step++) {
    // a step that cannot find its control offers Skip and says why
    await expect(card.getByRole("button", { name: "Skip", exact: true })).toHaveCount(0);
    // a presenter reads the caption, then presses the arrow once and waits for the next step
    await expect(card.getByText(/\w{3}/u).first()).toBeVisible();
    await page.waitForTimeout(1500);
    await page.keyboard.press("ArrowRight");
    await expect.poll(stepOf, { timeout: 30_000 }).toBe(step + 1);
  }
  await expect(done).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Resolved");
  await done.click();
  await expect(card).toHaveCount(0);
});
