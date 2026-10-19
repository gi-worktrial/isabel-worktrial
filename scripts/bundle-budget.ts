// what the first page downloads before it runs, read from the built dist/client/index.html: the entry script and its
// modulepreloads stay under a budget. run with node after vite build
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// entry scripts and preloads; platform's Issues module and its yaml parser load first, as in platform's web
// 800 kB: the loader crumbs' title helpers live in small modules (titles.ts, features/traces/crumbs.ts), so the trace
// view, Markdown and Automations stay lazy (Krish Oct 16, demo-ready polish)
const BUDGET_BYTES = 800_000;

function kb(value: number): string {
  return `${Math.round(value / 1000)} kB`;
}

const DIST = fileURLToPath(new URL("../dist/client", import.meta.url));
const html = readFileSync(join(DIST, "index.html"), "utf8");
const loaded = [
  ...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="\/([^"]+)"/g),
  ...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="\/([^"]+)"/g),
].map((match) => match[1]);

const problems: string[] = [];
if (loaded.length === 0) {
  problems.push("dist/client/index.html loads no module script");
}
const bytes = loaded.reduce((sum, path) => sum + statSync(join(DIST, path)).size, 0);
if (bytes > BUDGET_BYTES) {
  problems.push(
    `the entry and its preloads weigh ${kb(bytes)}, over the ${kb(BUDGET_BYTES)} budget`,
  );
}
for (const problem of problems) {
  process.stdout.write(`bundle-budget: ${problem}\n`);
}
process.stdout.write(
  `bundle-budget: ${kb(bytes)} of ${kb(BUDGET_BYTES)} across ${loaded.length} files\n`,
);
process.exitCode = problems.length > 0 ? 1 : 0;
