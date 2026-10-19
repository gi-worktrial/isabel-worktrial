import { expect, test } from "vitest";

import plugin from "./oxlint-plugin-repo.mjs";

function messages(rule, filename, source, { type = "ImportDeclaration", ...node } = {}) {
  const diagnostics = [];
  const visitors = plugin.rules[rule].create({
    filename,
    report: ({ message }) => diagnostics.push(message),
  });
  visitors[type]?.({
    type,
    importKind: "value",
    specifiers: [],
    ...node,
    source: { type: "Literal", value: source },
  });
  return diagnostics;
}

test.each(["#src/ui/button", "../ui/button.tsx", "./../ui/./button.tsx"])(
  "pebble cannot import UI through %s",
  (source) => {
    expect(messages("layers", "/port/web/src/pebble/example.ts", source)).toEqual([
      "src/pebble cannot import src/ui (AGENTS.md Rules)",
    ]);
  },
);

test("relative imports resolve from the importing file and stay inside its source root", () => {
  expect(
    messages("layers", "/port/web/src/pebble/nested/example.ts", "../../ui/button.tsx"),
  ).toHaveLength(1);
  expect(messages("layers", "/port/web/src/pebble/nested/example.ts", "../format.ts")).toEqual([]);
  expect(messages("layers", "/port/web/src/pebble/example.ts", "../ui/format-extra.ts")).toEqual(
    [],
  );
  expect(
    messages("layers", "/port/web/src/pebble/example.ts", "../../other/src/ui/button.tsx"),
  ).toEqual([]);
});

test.each(["@grounded-intelligence/grounded-sdk", "@grounded-intelligence/grounded-sdk/genai"])(
  "native SDK import %s keeps the SDK layer boundary",
  (source) => {
    expect(messages("layers", "/port/web/src/ui/example.ts", source)).toEqual([
      "src/ui cannot import src/sdk (AGENTS.md Rules)",
    ]);
    expect(messages("layers", "/port/web/src/pebble/example.ts", source)).toEqual([]);
  },
);

test("native SDK stays free of React", () => {
  expect(messages("layers", "/port/libs/grounded-sdk/src/agents.ts", "react")).toEqual([
    "src/sdk stays free of React, so it cannot import react",
  ]);
});

test.each([
  ["/port/libs/grounded-sdk/src/agents.ts", "./api.ts", "ImportDeclaration"],
  ["/port/libs/grounded-sdk/src/api.test.ts", "./index.ts", "ImportDeclaration"],
  ["/port/libs/grounded-sdk/src/index.ts", "./agents.ts", "ExportNamedDeclaration"],
  ["/demo/src/sdk/issues.ts", "yaml", "ImportDeclaration"],
])("native library %s can use %s", (file, source, type) => {
  expect(messages("layers", file, source, { type })).toEqual([]);
});

test.each([
  ["/port/libs/grounded-sdk/src/agents.ts", "#src/queries/client"],
  ["/port/libs/grounded-sdk/src/agents.ts", "./nested/api.ts"],
  ["/demo/src/sdk/agents.ts", "node:fs"],
])("native library %s rejects %s", (file, source) => {
  expect(messages("layers", file, source)).toHaveLength(1);
});

test("only app/services may load the demo from product code, and its load is dynamic", () => {
  const demo = "#src/demo/services";
  expect(
    messages("layers", "/port/web/src/app/services.ts", demo, { type: "ImportExpression" }),
  ).toEqual([]);
  expect(messages("layers", "/port/web/src/app/services.ts", demo)).toHaveLength(1);
  expect(
    messages("layers", "/port/web/src/app/shell.tsx", demo, { type: "ImportExpression" }),
  ).toHaveLength(1);
  expect(messages("layers", "/port/web/src/app/services.test.ts", demo)).toEqual([]);
});

test("platform's mirrored web files resolve #/ to src/platform and never reach the demo", () => {
  expect(messages("layers", "/port/web/src/platform/queries.ts", "#/services")).toEqual([]);
  expect(
    messages("layers", "/port/web/src/platform/routes/index.tsx", "../db/organizations"),
  ).toEqual([]);
  expect(messages("layers", "/port/web/src/platform/ui/tag.tsx", "#src/ui/tag")).toEqual([]);
  expect(messages("layers", "/port/web/src/platform/sidebar.tsx", "#src/app/public")).toEqual([]);
  expect(messages("layers", "/port/web/src/platform/sidebar.tsx", "#src/app/palette")).toEqual([
    "src/platform reaches src/app only through src/app/public and src/app/services",
  ]);
  expect(
    messages("layers", "/port/web/src/platform/services.ts", "#src/demo/services"),
  ).toHaveLength(1);
  expect(messages("layers", "/port/web/src/pebble/example.ts", "#/ui/button")).toEqual([
    "src/pebble cannot import src/platform (AGENTS.md Rules)",
  ]);
});

test("the demo reaches product browser interactions only through app/public", () => {
  expect(messages("layers", "/port/web/src/demo/shell.tsx", "#src/app/public")).toEqual([]);
  for (const source of [
    "#src/app/services",
    "#src/queries/queries",
    "#src/features/pebble/panel",
  ]) {
    expect(messages("layers", "/port/web/src/demo/shell.tsx", source)).toHaveLength(1);
  }
  expect(messages("layers", "/port/web/src/demo/plane/client.ts", "#src/app/public")).toHaveLength(
    1,
  );
});

test("the backend takes only the client contract's type from the product", () => {
  const contract = "#src/queries/client";
  expect(
    messages("layers", "/port/web/src/demo/plane/client.ts", contract, { importKind: "type" }),
  ).toEqual([]);
  expect(messages("layers", "/port/web/src/demo/plane/client.ts", contract)).toHaveLength(1);
  expect(
    messages("layers", "/port/web/src/demo/plane/client.ts", "#src/queries/queries"),
  ).toHaveLength(1);
});

function classMessages(rule, filename, value) {
  const diagnostics = [];
  const visitors = plugin.rules[rule].create({
    filename,
    report: ({ message }) => diagnostics.push(message),
  });
  visitors.Literal?.({ type: "Literal", value });
  return diagnostics;
}

test.each([
  "gap-1.5",
  "px-2.5 py-1",
  "hover:-ml-1.5",
  "flex mt-0.5",
  "pl-[6px]",
  "inset-x-[10px]",
  "gap-[1.5px]",
  "mx-px",
])("spacing %s is off the 4px grid", (value) => {
  expect(classMessages("layout-spacing-scale", "/demo/src/ui/example.tsx", value)).toHaveLength(1);
});

test.each([
  "gap-2 px-3 -ml-2",
  "p-[12px] top-[100px]",
  "h-0.5 size-3.5 w-[22px] h-px",
  "max-h-[calc(13*28px+8px)]",
])("spacing %s stays on the 4px grid", (value) => {
  expect(classMessages("layout-spacing-scale", "/demo/src/ui/example.tsx", value)).toEqual([]);
});
