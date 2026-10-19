// the design spec, docs/design-spec.md, generated from the stylesheets so people, agents and a Figma spec read the
// same tokens the app paints with; checks it is current and that the grounded-design skill names only real tokens.
// run with node; --write regenerates the file
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const at = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const SPEC = "docs/design-spec.md";
const SKILL = ".agents/skills/grounded-design/SKILL.md";

type Token = { name: string; light: string; dark: string | undefined; note: string };

// each `--name: value;` in a block, with the comment just above its group as its note; a blank line or the next
// comment ends a group
function declarations(block: string): Array<{ name: string; value: string; note: string }> {
  const found: Array<{ name: string; value: string; note: string }> = [];
  let note = "";
  for (const part of block.matchAll(/\/\*([\s\S]*?)\*\/|--([\w-]+)\s*:([^;]*);|\n[ \t]*\n/gu)) {
    if (part[1] !== undefined) {
      note = part[1].trim().replaceAll(/\s+/gu, " ");
    } else if (part[2] === undefined) {
      note = "";
    } else if (!part[3]!.includes("initial")) {
      found.push({ name: part[2], value: part[3]!.trim().replaceAll(/\s+/gu, " "), note });
    }
  }
  return found;
}

// the block a selector opens at the start of a line, so `[data-theme="dark"]` is not found inside another selector
function blockOf(css: string, opener: string): string {
  const start = css.startsWith(opener) ? 0 : css.indexOf(`\n${opener}`);
  if (start === -1) {
    throw new Error(`No ${opener} block`);
  }
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    depth += css[index] === "{" ? 1 : css[index] === "}" ? -1 : 0;
    if (depth === 0) {
      return css.slice(open + 1, index);
    }
  }
  throw new Error(`Unclosed ${opener} block`);
}

/** Platform's tokens.css, kept byte for byte, then what the demo adds or overrides. */
export const TOKEN_SHEETS = [
  "src/platform/styles/tokens.css",
  "src/styles/tokens-demo.css",
] as const;

export const readTokenSheets = () => TOKEN_SHEETS.map((path) => readFileSync(at(path), "utf8"));

// each sheet's @theme and dark block, a later sheet's value replacing an earlier one's under the same name
export function tokens(sheets: readonly string[]): Token[] {
  const merged = new Map<string, Token>();
  for (const css of sheets) {
    const dark = new Map(
      declarations(blockOf(css, '[data-theme="dark"]')).map((entry) => [entry.name, entry.value]),
    );
    for (const { name, value, note } of declarations(blockOf(css, "@theme"))) {
      const earlier = merged.get(name);
      merged.set(name, {
        name,
        light: value,
        dark: dark.get(name) ?? earlier?.dark,
        note: note || (earlier?.note ?? ""),
      });
    }
  }
  return [...merged.values()];
}

function typeScale(css: string): Array<{ name: string; spec: string }> {
  return [...css.matchAll(/@utility (type-[\w-]+) \{\s*@apply ([^;]+);/gu)].map((match) => ({
    name: match[1]!,
    spec: match[2]!.trim(),
  }));
}

const cell = (text: string) => text.replaceAll("|", "\\|");

export function spec(tokenSheets: readonly string[], typeCss: string): string {
  const all = tokens(tokenSheets);
  const colors = all.filter(({ name }) => name.startsWith("color-"));
  const rest = all.filter(({ name }) => !name.startsWith("color-"));
  return [
    "# Design spec",
    "",
    "The tokens the product paints with, generated from `src/platform/styles/tokens.css`, `src/styles/tokens-demo.css` and `src/platform/styles/type.css` by `node scripts/design-spec.ts --write`. `pnpm check` fails when this file is out of date. How to use them (spacing, rows, icons, dense information, one primary per view) is in the [grounded-design skill](../.agents/skills/grounded-design/SKILL.md).",
    "",
    "Spacing sits on a 4px grid, which the `repo/layout-spacing-scale` lint enforces. Light is the default theme and dark comes only from the toggle.",
    "",
    "## Colors",
    "",
    "Use a color as a Tailwind utility on its name (`bg-surface`, `text-muted`, `border-divider`), never as a raw value.",
    "",
    "| Token | Light | Dark | What it is for |",
    "| --- | --- | --- | --- |",
    ...colors.map(
      ({ name, light, dark, note }) =>
        `| \`${name.slice("color-".length)}\` | \`${cell(light)}\` | ${dark === undefined ? "same" : `\`${cell(dark)}\``} | ${cell(note)} |`,
    ),
    "",
    "## Type",
    "",
    "| Utility | Definition |",
    "| --- | --- |",
    ...typeScale(typeCss).map(
      ({ name, spec: definition }) => `| \`${name}\` | \`${cell(definition)}\` |`,
    ),
    "",
    "## Radii, shadow, fonts, motion and widths",
    "",
    "| Token | Value |",
    "| --- | --- |",
    ...rest.map(({ name, light }) => `| \`${name}\` | \`${cell(light)}\` |`),
    "",
  ].join("\n");
}

// a `--color-x`, `bg-x`-style mention of a color, or a `type-x` utility the skill names, that the stylesheets lack
function unknownTokens(skill: string, tokenSheets: readonly string[], typeCss: string): string[] {
  const known = new Set(tokens(tokenSheets).map(({ name }) => name));
  const types = new Set(typeScale(typeCss).map(({ name }) => name));
  const named = [
    ...[...skill.matchAll(/--(color-[a-z0-9-]+)/gu)].map((match) => match[1]!),
    ...[...skill.matchAll(/`(type-[a-z]+-\d+)`/gu)].map((match) => match[1]!),
  ];
  return [...new Set(named)].filter((name) =>
    name.startsWith("type-") ? !types.has(name) : !known.has(name),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tokenSheets = readTokenSheets();
  const typeCss = readFileSync(at("src/platform/styles/type.css"), "utf8");
  const fresh = spec(tokenSheets, typeCss);
  const problems: string[] = [];
  if (process.argv.includes("--write")) {
    writeFileSync(at(SPEC), fresh);
  } else if (readFileSync(at(SPEC), "utf8") !== fresh) {
    problems.push(`${SPEC} is out of date; run node scripts/design-spec.ts --write`);
  }
  for (const name of unknownTokens(readFileSync(at(SKILL), "utf8"), tokenSheets, typeCss)) {
    problems.push(`${SKILL} names ${name}, which the stylesheets do not define`);
  }
  for (const problem of problems) {
    process.stdout.write(`design-spec: ${problem}\n`);
  }
  process.exitCode = problems.length > 0 ? 1 : 0;
}
