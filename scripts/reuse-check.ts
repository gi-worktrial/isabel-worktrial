// the frontend-engineering skill's Libraries table is the register: every dependency sits in a row, and every path it
// names under src/ exists
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REGISTER = ".agents/skills/frontend-engineering/SKILL.md";
// what every React app on Tailwind carries, with no alternative worth writing down
const EXEMPT = /^(?:react|react-dom|tailwindcss|@fontsource-variable\/.+)$/;

const ticked = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
// each row is | Need | Library | Where |, below the header and its divider
const rows = readFileSync(join(ROOT, REGISTER), "utf8")
  .split("\n")
  .filter((line) => line.startsWith("| ") && !/^\| (?:Need |-{3,})/.test(line))
  .map((line) => line.split("|"));

const problems: string[] = [];
const named = new Set<string>();
for (const [, , libraries = "", where = ""] of rows) {
  for (const name of ticked(libraries)) {
    named.add(name);
  }
  for (const path of ticked(where)) {
    if (!existsSync(join(ROOT, "src", path))) {
      problems.push(`${REGISTER} names src/${path}, which does not exist`);
    }
  }
}

const { dependencies } = z
  .object({ dependencies: z.record(z.string(), z.string()) })
  .parse(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")));
// a scope written as @codemirror/* names every package in it
for (const name of Object.keys(dependencies)) {
  if (!EXEMPT.test(name) && !named.has(name) && !named.has(`${name.split("/")[0]}/*`)) {
    problems.push(`${name} in package.json is in no row of the Libraries table in ${REGISTER}`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    process.stderr.write(`reuse-check: ${problem}\n`);
  }
  process.exit(1);
}
