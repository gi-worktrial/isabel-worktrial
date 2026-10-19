// the review flow on the Unity seed, from a Detected Issue to its Fix shipped, through platform's Issue actions
import { expect, test } from "@playwright/test";

const ISSUE = "/demo/agents/unity-ai/issues/UNI-1048";

test("a Detected Issue is validated, its Candidate approved and shipped, and the Issue resolves", async ({
  page,
}) => {
  await page.goto(`${ISSUE}/traces`);
  // the step in progress, and the State fact once the Issue closes
  const phase = page.getByRole("list", { name: "Progress" }).locator('[aria-current="step"]');
  await expect(phase).toContainText("Validate");

  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(phase).toContainText("Review");

  // Review's one primary opens the Candidates tab, where each Candidate has its own Approve
  await page
    .getByRole("group", { name: "Issue actions" })
    .getByRole("link", { name: "Review Candidates", exact: true })
    .click();
  await expect(page).toHaveURL(/\/candidates$/u);
  await page.getByRole("table", { name: "Candidates" }).getByRole("link").first().click();
  await page
    .getByRole("group", { name: "Candidate actions" })
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  const approve = page.getByRole("dialog");
  await approve.getByRole("button", { name: /^Approve [0-9a-f]{7}$/u }).click();
  await expect(
    page.getByRole("group", { name: "Issue details" }).getByRole("group", { name: "Approved" }),
  ).toBeVisible();
  // the Deploy step opens the approved Candidate
  await expect(phase).toContainText("Deploy");
  await expect(phase.getByRole("link")).toHaveAttribute("href", /\/candidates\/[^/]+$/u);

  await page.getByRole("button", { name: "Mark as shipped", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Mark as shipped" })
    .getByRole("button", { name: "Mark as shipped" })
    .click();
  await expect(
    page.getByRole("group", { name: "Issue details" }).getByRole("group", { name: "State" }),
  ).toContainText("Resolved");
  await expect(page.getByRole("link", { name: "Activity", exact: true })).toBeVisible();
});
