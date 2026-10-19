import { expect } from "@playwright/test";
import { afterAll, beforeAll, test } from "vitest";

import { componentPage } from "#test/component-page";

const fixture = `<!doctype html><html><body><div id="root"></div><script type="module">
import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { RowAction, RowActions, Table } from "/src/ui/table.tsx";
import { TooltipProvider } from "/src/platform/ui/tooltip.tsx";

const mode = new URLSearchParams(location.search).get("mode");
const rows = [
  { name: "Beta", state: "open", count: 2 },
  { name: "Alpha", state: "open", count: 9 },
  { name: "Gamma", state: "closed", count: 5 },
];
function Fixture() {
  const [event, setEvent] = useState("None");
  const record = (name, action) => setEvent(name + ":" + action);
  const columns = [
    { id: "name", label: "Name", kind: "primary", sort: (row) => row.name,
      cell: (row) => h(RowAction, { asChild: mode === "link", onClick: () => record(row.name, "open") },
        mode === "link" ? h("a", { href: "#details" }, row.name) : row.name) },
    { id: "count", label: "Count", kind: "number", cell: (row) => row.count },
    { id: "actions", label: "Actions", kind: "actions", cell: (row) => h(RowActions, {
      row: row.name, actions: [
        { label: "Run " + row.name, icon: h("span", null, "Run"), onClick: () => record(row.name, "run") },
        { label: "Delete " + row.name, icon: h("span", null, "Delete"), disabled: true,
          onClick: () => record(row.name, "delete") },
      ] }) },
  ];
  return h("main", null,
    h(Table, { label: "Rows", rows, columns, rowKey: (row) => row.name }),
    h("output", { "aria-label": "Event" }, event));
}
createRoot(document.getElementById("root")).render(h(TooltipProvider, null, h(Fixture)));
</script></body></html>`;

let harness: Awaited<ReturnType<typeof componentPage>>;
beforeAll(async () => {
  harness = await componentPage("table-interactions-test", fixture);
}, 20000);
afterAll(() => harness?.close(), 20000);

test("pointer, Enter and Space toggle sorting and switching columns starts ascending", async () => {
  await harness.open(async (page) => {
    const table = page.getByRole("table", { name: "Rows", exact: true });
    const names = table.getByRole("button", { name: /^(Alpha|Beta|Gamma)$/ });
    const name = table.getByRole("button", { name: "Name", exact: true });
    await expect(names).toHaveText(["Beta", "Alpha", "Gamma"]);
    await name.click();
    await expect(names).toHaveText(["Alpha", "Beta", "Gamma"]);
    await expect(table.getByRole("columnheader", { name: "Name", exact: true })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    await name.press("Enter");
    await expect(names).toHaveText(["Gamma", "Beta", "Alpha"]);
    await name.press("Space");
    await expect(names).toHaveText(["Alpha", "Beta", "Gamma"]);
    await table.getByRole("button", { name: "Count", exact: true }).click();
    await expect(names).toHaveText(["Beta", "Gamma", "Alpha"]);
    await expect(
      table.getByRole("columnheader", { name: "Name", exact: true }),
    ).not.toHaveAttribute("aria-sort");
  });
}, 15000);

test("row actions activate independently and disabled actions stay out of the keyboard sequence", async () => {
  await harness.open(async (page) => {
    const table = page.getByRole("table", { name: "Rows", exact: true });
    const event = page.getByRole("status", { name: "Event", exact: true });
    const row = table.getByRole("button", { name: "Beta", exact: true });
    const run = table.getByRole("button", { name: "Run Beta", exact: true });
    await row.click();
    await expect(event).toHaveText("Beta:open");
    await run.click();
    await expect(event).toHaveText("Beta:run");
    await row.press("Enter");
    await expect(event).toHaveText("Beta:open");
    await row.press("Tab");
    await expect(run).toBeFocused();
    await run.press("Space");
    await expect(event).toHaveText("Beta:run");
    await expect(table.getByRole("button", { name: "Delete Beta", exact: true })).toBeDisabled();
    await run.press("Tab");
    await expect(table.getByRole("button", { name: "Alpha", exact: true })).toBeFocused();
  });
}, 15000);

test("asChild keeps link semantics and keyboard activation", async () => {
  await harness.open(async (page) => {
    const link = page.getByRole("link", { name: "Beta", exact: true });
    await expect(link).toHaveAttribute("href", "#details");
    await link.press("Enter");
    await expect(page.getByRole("status", { name: "Event", exact: true })).toHaveText("Beta:open");
    await expect(page).toHaveURL(/#details$/);
  }, "?mode=link");
}, 15000);
