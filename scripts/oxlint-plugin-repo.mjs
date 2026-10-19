import { readFileSync } from "node:fs";
import { posix } from "node:path";

// permitted imports by source folder; app may compose every layer
const LAYERS = {
  sdk: "sdk",
  assets: "assets",
  ui: "assets platform ui",
  data: "data",
  pebble: "sdk data pebble",
  queries: "sdk data queries platform",
  features: "assets sdk data pebble features queries ui platform",
  demo: "app assets sdk data demo pebble platform ui",
  // platform's web app at its own paths; patches, shims and forks call our modules, and reach app only through its
  // public bridge and the services it loads
  platform: "app assets sdk data features pebble platform queries ui",
};
// the demo has one product entry point; tests may reach its runtime directly
const GATES = { demo: ["demo", "app/services"] };
// modules that import nothing, or only the SDK, which any folder may import: platform's chat view is React free, and
// the demo's thread socket reads it as Pebble's pure modules do
const OPEN_MODULES = new Set([
  "ui/listeners",
  "ui/format-extra",
  "platform/ui/format",
  "platform/lib/pebble/view",
]);

// the layers under the React ones stay free of React and its component libraries
const REACT_FREE = new Set(["sdk", "pebble", "data"]);
const REACT_PACKAGE = /^(react|react-dom|@tanstack\/react-router|lucide-react|radix-ui)(\/|$)/;
// platform's SDK files import only each other and these packages, by relative path, so they stay byte for byte
const SDK_PACKAGES = [
  "zod",
  "zod/mini",
  "agents/client",
  "agents/harness/pi",
  "@earendil-works/pi-durable",
  "@earendil-works/chord/delta",
  "yaml",
];
// a feature imports another feature only through a module listed here with the features that import it; every
// cleanup shrinks this list, and a new cross-feature import has to be added on purpose
const CROSS_FEATURE = {
  "candidates/branches": "debug",
  "candidates/file-fold": "debug",
  "candidates/proofs": "issue",
  "candidates/proofs-view": "debug",
  "candidates/text-diff": "debug",
  "debug/files": "candidates",
  "inbox/lanes": "issue",
  "issue/skeletons": "debug",
  "traces/trace-view": "debug",
};

const within = (module, folder) => module === folder || module.startsWith(`${folder}/`);
const bare = (path) => path.replace(/\.tsx?$/, "");
const isTest = (filename) => /\.test\.tsx?$/.test(filename);

function sourceFile(filename) {
  const native = /(?:^|\/)libs\/grounded-sdk\/src\/(.+)$/.exec(filename);
  if (native !== null) {
    return `sdk/${native[1]}`;
  }
  const at = filename.lastIndexOf("/src/");
  return at === -1 ? null : filename.slice(at + "/src/".length);
}

function sourceModule(filename, source) {
  if (source.startsWith("#src/")) {
    return bare(source.slice(5));
  }
  // platform's own alias for its web/src
  if (source.startsWith("#/")) {
    return bare(`platform/${source.slice(2)}`);
  }
  const native = /^@grounded-intelligence\/grounded-sdk(?:\/(.+))?$/.exec(source);
  if (native !== null) {
    return bare(`sdk/${native[1] ?? "index"}`);
  }
  const at = filename.lastIndexOf("/src/");
  if (at === -1 || !source.startsWith(".")) {
    return null;
  }
  const root = filename.slice(0, at + "/src/".length);
  const module = posix.relative(root, posix.join(posix.dirname(filename), source));
  const file =
    module === ".." || module.startsWith("../") ? null : sourceFile(posix.join(root, module));
  return file === null ? null : bare(file);
}

// the SDK's own tests run under vitest
function sdkImportViolation(source, filename) {
  if (
    /^\.\/[\w-]+\.ts$/.test(source) ||
    SDK_PACKAGES.includes(source) ||
    (source === "vitest" && filename.endsWith(".test.ts"))
  ) {
    return null;
  }
  return `src/sdk imports only ${[...SDK_PACKAGES, "its own files as ./name.ts"].join(", ")}, so it cannot import ${source}`;
}

function layerViolation(filename, source, node) {
  const file = sourceFile(filename);
  if (file === null) {
    return null;
  }
  const [layer, ...rest] = file.split("/");
  const plane = within(bare(file), "demo/plane");
  if (
    (REACT_FREE.has(layer) || (plane && !isTest(filename))) &&
    (REACT_PACKAGE.test(source) || (plane && /^@tanstack\/react-query(\/|$)/.test(source)))
  ) {
    return `src/${plane ? "demo/plane" : layer} stays free of React, so it cannot import ${source}`;
  }
  const match = /^([^/]+)\/(.+)$/.exec(sourceModule(filename, source) ?? "");
  if (match === null) {
    return null;
  }
  const [, target, module] = match;
  const test = isTest(filename);
  if (
    plane &&
    !test &&
    target !== "sdk" &&
    !(target === "demo" && within(module, "plane")) &&
    target !== "pebble" &&
    !OPEN_MODULES.has(`${target}/${module}`) &&
    // the backend implements the product's client contract, so it takes its type
    !(target === "queries" && module === "client" && node.importKind === "type")
  ) {
    return `src/demo/plane imports only its own runtime, src/sdk and Pebble's pure modules, so it cannot import src/${target}/${module}`;
  }
  const gate = GATES[target];
  if (gate !== undefined && !test && !gate.some((folder) => within(bare(file), folder))) {
    return `src/${target} is imported only from ${gate.map((folder) => `src/${folder}`).join(" and ")}`;
  }
  if (target === "demo" && bare(file) === "app/services" && node.type !== "ImportExpression") {
    return "src/app/services loads the demo through import()";
  }
  if (
    layer === "demo" &&
    !test &&
    (target === "features" ||
      (target === "platform" && !within(module, "ui") && !OPEN_MODULES.has(`platform/${module}`)) ||
      (target === "queries" && module !== "client") ||
      (target === "app" && module !== "public"))
  ) {
    return "src/demo reaches the product only through src/app/public and the client contract in src/queries/client";
  }
  if (layer === "platform" && target === "app" && module !== "public" && module !== "services") {
    return "src/platform reaches src/app only through src/app/public and src/app/services";
  }
  const allowed = LAYERS[layer]?.split(" ");
  if (
    allowed?.includes(target) === false &&
    !(layer === "demo" && target === "queries") &&
    !OPEN_MODULES.has(`${target}/${module}`)
  ) {
    return `src/${layer} cannot import src/${target} (AGENTS.md Rules)`;
  }
  if (layer !== "features" || target !== "features") {
    return null;
  }
  const [own] = rest;
  return module.split("/")[0] === own || CROSS_FEATURE[module]?.split(" ").includes(own)
    ? null
    : `features/${own} imports features/${module}, which is not in CROSS_FEATURE for it`;
}

// static design checks read class strings + jsx; .oxlintrc.json sets each level
const TYPE_TOKENS = new Set(
  [
    ...readFileSync(new URL("../src/platform/styles/type.css", import.meta.url), "utf8").matchAll(
      /@utility (type-[\w-]+)/g,
    ),
  ].map((match) => match[1]),
);
// padding, margin, gap, space and inset utilities; sizes such as h-[22px] are the design system's own
const SPACING =
  "-?(?:p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left|indent)";
const ROW_SIZES = /\b(type-(?:copy-14|meta-12|mono-12))\b/;
const HEADING = /^(?:h[1-6]|Dialog\.Title)$/;

// each checks a class string, a string or template text in a src file, and says what is wrong or null
const CLASS_RULES = {
  "colour-tokens-only": {
    skip: (file) => file.startsWith("styles/") || file.startsWith("assets/"),
    pattern: /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgb|hsl)a?\(/i,
    // a hex of digits alone is an id such as a PR number, not a colour
    message: ([hit]) =>
      /^#\d+$/.test(hit)
        ? null
        : `${hit} is a raw colour; use a token from src/platform/styles/tokens.css or add one to src/styles/tokens-demo.css`,
  },
  "type-named-by-size": {
    pattern: /text-\[(?:\d|1[01])(?:\.\d+)?px\]|font-size:\s*(?:\d|1[01])px/,
    message: ([hit]) => `${hit} renders under 12px; use type-meta-12 or type-mono-12`,
  },
  "theme-light-default": {
    pattern: /prefers-color-scheme/,
    message: () => "the theme follows the OS here; read data-theme through the dark: variant",
  },
  // half steps (0.5, 1.5, 2.5, 3.5) and pixel values that are not a multiple of 4 are off the 4px grid
  "layout-spacing-scale": {
    pattern: new RegExp(
      `(?:^|[\\s"'\`:])(${SPACING})-(\\d+\\.5|px|\\[(?:\\d*[13579]|(?:\\d*[02468])?[26]|\\d*[13579][048]|\\d*\\.\\d+)px\\])(?![\\w.])`,
    ),
    message: ([, utility, value]) =>
      `${utility}-${value} is off the 4px grid; use a whole Tailwind step or a multiple of 4px`,
  },
  "colour-no-purple": {
    pattern:
      /\b(?:text|bg|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret)-(?:purple|violet|fuchsia|indigo)-\d{2,3}\b/,
    message: ([hit]) =>
      `${hit} brings in purple; use blue for what is next, green or red for an outcome, and the purple token only for an LLM judge`,
  },
  "type-known-token": {
    skip: (file) => file.startsWith("styles/"),
    pattern: /\btype-[a-z]+-[a-z]*\d+\b/,
    message: ([hit]) =>
      TYPE_TOKENS.has(hit)
        ? null
        : `${hit} is not a type token in src/platform/styles/type.css, so the text takes no size`,
  },
  "colour-focus-quiet": {
    pattern: /focus-visible:(?:ring|outline)-(?!ring\b|2\b|inset\b|offset-|none\b)[\w-]+/,
    message: ([hit]) => `${hit} is not the grey focus ring from global.css`,
  },
  "layout-shadow-floats-only": {
    pattern: /\bshadow-(?!float\b|none\b)[\w-]+/,
    message: ([hit]) => `${hit} on a layer that does not float; use shadow-float or none`,
  },
  "layout-rounded-not-square": {
    pattern: /\brounded-(?:md|lg|xl|2xl|3xl)\b/,
    message: ([hit]) => `${hit} is off the radii; use rounded-xs, rounded-sm or rounded-full`,
  },
  "type-bold-titles-only": {
    pattern: /\bfont-bold\b/,
    message: () => "font-bold; a title is semibold, and nothing else is bold",
  },
  "motion-no-transition-all": {
    pattern: /\btransition-all\b|transition:\s*all\b/,
    message: ([hit]) => `${hit} animates every property; name the ones that change, or let it snap`,
  },
  "selection-no-ink-border": {
    pattern:
      /(?:data-\[state=(?:open|active|selected|checked)\]|aria-(?:selected|expanded|current)(?:=\S+)?|selected|group-open(?:\/\w+)?|open):(?:border|ring|outline)-(?:primary|ink|black)\b/,
    message: ([hit]) => `${hit} marks a selection in ink; use row-selected or a light fill step`,
  },
  // a chart block's body stays under its type-heading-15 title
  "type-heading-scale": {
    skip: (file) =>
      !file.startsWith("features/panels/charts/") && file !== "features/panels/chart-parts.tsx",
    pattern: /\btype-(?:prose|copy)-14\b/,
    message: ([hit]) =>
      `a chart block's body set at ${hit}, its title's size; use type-label-13 or type-meta-12`,
  },
};

// the file's path under src, or null outside it
const srcFile = (context) => context.filename.split("/src/").at(1) ?? null;
const jsxName = (node) =>
  node.name.type === "JSXMemberExpression"
    ? `${node.name.object.name}.${node.name.property.name}`
    : node.name.name;
const attribute = (opening, name) =>
  opening.attributes.find((each) => each.type === "JSXAttribute" && each.name.name === name);
// a className's text, whether a string or a template's fixed parts
function classText(value) {
  const expression = value?.type === "JSXExpressionContainer" ? value.expression : value;
  if (expression?.type === "Literal") {
    return typeof expression.value === "string" ? expression.value : "";
  }
  return expression?.type === "TemplateLiteral"
    ? expression.quasis.map((quasi) => quasi.value.raw).join(" ")
    : "";
}
const className = (node) => classText(attribute(node, "className")?.value);

// each reports what is wrong with one JSX element that opens in a src file, or says nothing
const JSX_RULES = {
  "type-no-mono-heading": (node) =>
    /^h[1-6]$/.test(jsxName(node)) && /\b(?:type-mono-\d+|font-mono)\b/.test(className(node))
      ? "a heading set in mono; set a title in the sans, and keep mono for ids, paths and fact pills"
      : null,
  // a heading never takes a row's size
  "type-heading-scale": (node) => {
    const size = HEADING.test(jsxName(node)) ? className(node).match(ROW_SIZES) : null;
    return size === null
      ? null
      : `a heading set at ${size[1]}, a row's size; use type-title-18, type-heading-15 or type-label-13`;
  },
  "controls-pickers-are-select": (node, file) =>
    jsxName(node) === "select" && !file.startsWith("ui/")
      ? "a native select; use Select from src/ui/select.tsx, or a segmented control for two or three options"
      : null,
  "controls-icon-button-label": (node) =>
    jsxName(node) === "IconButton" && attribute(node, "title") !== undefined
      ? "title= on an IconButton; its label prop is its name and its tooltip"
      : null,
  "sections-flat-disclosure": (node) => {
    if (jsxName(node) !== "Section") {
      return null;
    }
    for (let up = node.parent?.parent; up !== undefined && up !== null; up = up.parent) {
      if (up.type === "JSXElement" && jsxName(up.openingElement) === "Section") {
        return "a Section inside another; part the inner section by a hairline in the one surface";
      }
    }
    return null;
  },
};

const rule = (type, description, create) => ({ meta: { type, docs: { description } }, create });
const design = (id, create) =>
  rule("suggestion", `grounded-design ${id}`, (context) => {
    const file = srcFile(context);
    return file === null ? {} : create(context, file);
  });

// the import and export forms whose source names a module
function imports(context, check, kinds) {
  const visit = (node) => {
    if (node.source?.type === "Literal" && typeof node.source.value === "string") {
      const message = check(node.source.value, node);
      if (message !== null) {
        context.report({ node: node.source, message });
      }
    }
  };
  return Object.fromEntries(kinds.map((kind) => [kind, visit]));
}
const DECLARATIONS = ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"];

const DESIGN_RULES = Object.fromEntries(
  [...new Set([...Object.keys(CLASS_RULES), ...Object.keys(JSX_RULES)])].map((id) => [
    id,
    design(id, (context, file) => {
      const visitors = {};
      const text = CLASS_RULES[id];
      if (text !== undefined && !text.skip?.(file)) {
        const check = (node, value) => {
          const match = typeof value === "string" ? value.match(text.pattern) : null;
          const message = match === null ? null : text.message(match);
          if (message !== null) {
            context.report({ node, message });
          }
        };
        visitors.Literal = (node) => check(node, node.value);
        visitors.TemplateElement = (node) => check(node, node.value.raw);
      }
      const jsx = JSX_RULES[id];
      if (jsx !== undefined) {
        visitors.JSXOpeningElement = (node) => {
          const message = jsx(node, file);
          if (message !== null) {
            context.report({ node, message });
          }
        };
      }
      return visitors;
    }),
  ]),
);

export default {
  meta: { name: "repo", version: "1.0.0" },
  rules: {
    ...DESIGN_RULES,
    "colour-one-primary": rule("suggestion", "grounded-design colour-one-primary", (context) => {
      let primaries = 0;
      return {
        JSXAttribute(node) {
          if (node.name.name === "variant" && classText(node.value) === "primary") {
            primaries += 1;
            if (primaries === 2) {
              const message = "a second primary button in one file; keep one per screen or pane";
              context.report({ node, message });
            }
          }
        },
      };
    }),
    // browser storage goes through src/data/storage.ts, including the public app bridge
    "persistence-browser-storage-only": rule(
      "problem",
      "grounded-design persistence-browser-storage-only",
      (context) => {
        const file = srcFile(context);
        if (file === null || file === "data/storage.ts") {
          return {};
        }
        return {
          Identifier(node) {
            if (node.name === "localStorage" || node.name === "sessionStorage") {
              const message = `${node.name} outside src/data/storage.ts`;
              context.report({ node, message });
            }
          },
        };
      },
    ),
    "layers": rule(
      "problem",
      "Keep each src folder to the folders under it, features to the listed cross-feature imports, and src/sdk to its packages",
      (context) => {
        const { filename } = context;
        const sdk = sourceFile(filename)?.startsWith("sdk/") ?? false;
        return imports(
          context,
          (source, node) =>
            layerViolation(filename, source, node) ??
            (sdk ? sdkImportViolation(source, filename) : null),
          [...DECLARATIONS, "ImportExpression"],
        );
      },
    ),
    "no-enum": rule(
      "problem",
      "Forbid TypeScript enums; the codebase uses unions of string literals",
      (context) => ({
        TSEnumDeclaration(node) {
          context.report({
            node,
            message: "Use a union of string literals instead of an enum (README)",
          });
        },
      }),
    ),
    // the README conventions oxlint has no built-in rule for; the character classes are \u escapes so this file passes
    // its own rule
    "no-typographic-punctuation": rule(
      "problem",
      "Forbid em/en dashes and single-character arrows; use -- and -> (README)",
      (context) => ({
        Program() {
          const { text } = context.sourceCode;
          const found = [
            [/[\u2013\u2014]/g, "Use `--` instead of em or en dashes"],
            [/[\u2190\u2192\u21D0\u21D2\u2194]/g, "Use `->` instead of single-character arrows"],
          ];
          for (const [pattern, message] of found) {
            for (const match of text.matchAll(pattern)) {
              const start = context.sourceCode.getLocFromIndex(match.index);
              context.report({
                loc: { start, end: { ...start, column: start.column + 1 } },
                message,
              });
            }
          }
        },
      }),
    ),
  },
};
