// Pebble's side panel opens in the main view (platform's chat routes) and follows the engineer back to the side, one
// chat in both; a question names the chat in the sidebar's list and shows what Pebble read; the panes move and trade
// widths
import { expect, test } from "@playwright/test";

test("Pebble opens in the main view, follows back to the side, and the panes rearrange", async ({
  page,
}) => {
  await page.goto("/demo/agents/unity-ai/issues/UNI-1050");
  await expect(page.getByRole("heading", { name: /Double jump/u })).toBeVisible();
  // the sidebar's Ask Pebble, apart from the one beside the stepper's caption
  const askPebble = page
    .getByRole("navigation", { name: "Navigation" })
    .getByRole("button", { name: "Ask Pebble" });
  await askPebble.click();
  // a closed or replaced panel stays mounted but inert, so the one in view is the one outside [inert]
  const pebble = page.locator('section[aria-label="Pebble"]:not([inert] *)');
  await expect(pebble.getByRole("group", { name: "Suggested prompts" })).toBeVisible();
  const prompt = pebble.getByRole("textbox", { name: "Prompt" });
  await prompt.fill("What fails here?");

  // a click on the chat outside its controls (a blank spot above the welcome) opens it in the main view, the draft with it
  await pebble.click({ position: { x: 40, y: 160 } });
  await expect(page).toHaveURL(/\/demo\/chat$/u);
  await expect(pebble).toHaveCount(1);
  await expect(prompt).toHaveValue("What fails here?");
  await expect(askPebble).toHaveAttribute("aria-pressed", "true");

  // going to another page puts Pebble back at the side, still holding the draft
  await page
    .getByRole("navigation", { name: "Navigation" })
    .getByRole("link", { name: "Traces", exact: true })
    .click();
  await expect(page).toHaveURL(/\/agents\/unity-ai\/traces/u);
  await expect(prompt).toHaveValue("What fails here?");
  await expect(askPebble).toHaveAttribute("aria-pressed", "true");

  // Back returns to the main view, where a question starts the chat, names it and lists it in the sidebar
  await page.goBack();
  await expect(page).toHaveURL(/\/demo\/chat$/u);
  await prompt.press("Enter");
  await expect(pebble.getByText("Pebble isn't connected in this demo.")).toBeVisible();
  await expect(page).toHaveURL(/\/demo\/chat\/[0-9a-f-]{36}$/u);
  const chats = page.getByRole("region", { name: "Chats" });
  await expect(chats.getByRole("link", { name: "What fails here?" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumbs" })).toContainText(
    "What fails here?",
  );

  // its Close goes back to the page before the main view with Pebble shut
  // the main view's own Close, beside Open in side panel
  await page
    .getByRole("button", { name: "Open in side panel" })
    .locator("..")
    .getByRole("button", { name: "Close Pebble" })
    .click();
  await expect(page).toHaveURL(/\/agents\/unity-ai\/traces/u);
  await expect(askPebble).toHaveAttribute("aria-pressed", "false");

  // the side panel picks the chat from a search, and an answer's fold shows the Issue in view that Pebble read
  await page.goto("/demo/agents/unity-ai/issues/UNI-1050");
  await askPebble.click();
  await pebble.getByRole("button", { name: "What fails here?", exact: true }).click();
  await page.getByRole("combobox", { name: "Search chats" }).fill("fails");
  await page.getByRole("option", { name: /What fails here\?/u }).click();
  await prompt.fill("Which Traces show it?");
  await prompt.press("Enter");
  await expect(pebble.getByText("Pebble isn't connected in this demo.")).toHaveCount(2);
  await pebble
    .getByRole("button", { name: /^Worked for /u })
    .last()
    .click();
  await expect(
    pebble.getByRole("group", { name: "Pebble read" }).getByRole("link", { name: "UNI-1050" }),
  ).toBeVisible();

  // Pebble moves to the left and, made primary, becomes the wide pane
  await pebble.getByRole("button", { name: "Pebble's layout" }).click();
  await page.getByRole("menuitem", { name: "Move to left" }).click();
  const main = page.locator("main");
  await expect
    .poll(async () => (await pebble.boundingBox())?.x)
    .toBeLessThan((await main.boundingBox())?.x ?? 0);
  await pebble.getByRole("button", { name: "Pebble's layout" }).click();
  await page.getByRole("menuitem", { name: "Make primary" }).click();
  await expect
    .poll(
      async () =>
        ((await pebble.boundingBox())?.width ?? 0) > ((await main.boundingBox())?.width ?? 0),
    )
    .toBe(true);
});
