// a failing Eval trial read as a flow: its failing step opens in place from Next failure, with its Grades' reasoning, and a pill opens its step without leaving Flow
import { expect, test } from "@playwright/test";

test("a failing trial's Flow opens its failing step from Next failure, and a pill opens its step in place", async ({
  page,
}) => {
  await page.goto("/demo/agents/unity-ai/traces?source=eval");
  await page
    .getByRole("table", { name: "Traces" })
    .getByRole("row")
    .filter({ hasText: "Failed" })
    .first()
    .getByRole("link")
    .first()
    .click();

  await page
    .getByRole("radiogroup", { name: "Trace view" })
    .getByRole("radio", { name: "Flow" })
    .click();
  await expect(page).toHaveURL(/view=flow/u);
  const flow = page.getByRole("group", { name: "Flow" });
  await expect(flow.getByRole("button", { name: /fails here$/u }).first()).toBeVisible();

  await flow.getByRole("button", { name: /^Next failure/u }).click();
  const detail = flow.getByRole("region", { name: / detail$/u });
  await expect(detail.getByRole("region", { name: "Grade reasoning" })).toBeVisible();

  await detail.getByRole("button", { name: "Close" }).click();
  await expect(detail).toBeHidden();

  await flow
    .getByRole("button", { name: /fails here$/u })
    .first()
    .click();
  await expect(flow.getByRole("region", { name: / detail$/u })).toBeVisible();
  await expect(page).toHaveURL(/view=flow/u);
});
