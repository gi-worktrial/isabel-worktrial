import { expect as browserExpect } from "@playwright/test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { call, componentPage } from "#test/component-page";

const fixture = `<!doctype html><html><body><div id="root"></div><script type="module">
import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { FileRail, RailToggle } from "/src/ui/file-tree.tsx";
import { TooltipProvider } from "/src/platform/ui/tooltip.tsx";
import { findTarget, press } from "/src/demo/walkthrough/drive.ts";
function Pane() {
  const [shown, setShown] = useState(false);
  const toggle = () => setShown(value => !value);
  return createElement("section", { "aria-label": "Editor" },
    createElement(RailToggle, { shown, onToggle: toggle }),
    shown ? createElement(FileRail, { label: "Files" },
      createElement("button", { type: "button" }, "overview.md")) : null,
    createElement("code-view", { ref: (host) => {
      if (host !== null && host.shadowRoot === null) {
        host.attachShadow({ mode: "open" }).innerHTML = '<div role="textbox" contenteditable="true" aria-label="notes.md">notes</div>';
      }
    } }));
}
createRoot(document.getElementById("root")).render(createElement(TooltipProvider, null,
  createElement(Pane),
  createElement("section", { "aria-label": "Other pane" },
    createElement("button", { type: "button" }, "overview.md")),
  createElement("div", { inert: true },
    createElement("section", { "aria-label": "Closed panel" },
      createElement("button", { type: "button" }, "Send")))));
window.locate = target => {
  const element = findTarget(target);
  return element === null ? null : { tag: element.tagName, name: element.getAttribute("aria-label"), text: element.textContent };
};
window.pressTarget = target => {
  const element = findTarget(target);
  if (element === null) throw new Error("The target is missing");
  press(element);
};
</script></body></html>`;

let harness: Awaited<ReturnType<typeof componentPage>>;
beforeAll(async () => {
  harness = await componentPage("walkthrough-driver-test", fixture);
}, 20000);

test("the driver finds a code editor inside a shadow root and skips inert controls", async () => {
  await harness.open(async (page) => {
    await browserExpect(page.getByRole("region", { name: "Editor" })).toBeVisible();
    expect(
      await call(page, "locate", { role: "textbox", name: "notes.md", within: editor }),
    ).toMatchObject({ tag: "DIV", name: "notes.md" });
    expect(await call(page, "locate", { role: "button", name: "Send" })).toBeNull();
    expect(await call(page, "locate", { role: "region", name: "Closed panel" })).toBeNull();
  });
}, 20000);
afterAll(() => harness?.close(), 20000);

const editor = { role: "region", name: "Editor" } as const;
const files = { role: "navigation", name: "Files", within: editor } as const;

test("the driver finds the real rail controls and scopes file targets to the visible rail", async () => {
  await harness.open(async (page) => {
    await browserExpect(
      page.getByRole("button", { name: "Show files", exact: true }),
    ).toBeVisible();
    expect(await call(page, "locate", files)).toBeNull();
    expect(
      await call(page, "locate", { role: "button", name: "overview.md", within: files }),
    ).toBeNull();
    await call(page, "pressTarget", { role: "button", name: "Show files", within: editor });
    await browserExpect(page.getByRole("navigation", { name: "Files" })).toBeVisible();
    expect(await call(page, "locate", files)).toMatchObject({
      tag: "NAV",
      name: "Files",
    });
    expect(
      await call(page, "locate", { role: "button", name: "/^overview\\.md$/", within: files }),
    ).toMatchObject({ tag: "BUTTON", text: "overview.md" });
    await call(page, "pressTarget", { role: "button", name: "Hide files", within: editor });
    await browserExpect(
      page.getByRole("button", { name: "Show files", exact: true }),
    ).toBeVisible();
    expect(await call(page, "locate", files)).toBeNull();
  });
}, 20000);
