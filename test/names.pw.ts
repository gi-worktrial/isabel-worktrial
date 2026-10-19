// every role and accessible name on each demo route, per Agent, against the baseline in test/names (gitignored, since
// the names carry demo-data's records); the first run or NAMES_UPDATE=1 writes the baseline, later runs list each
// name a page lost or gained. Pages are found by following links from each section, one page per route
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, type Page, test } from "@playwright/test";
import { z } from "zod";

import { AGENTS } from "#test/scenarios";

const DIR = join(import.meta.dirname, "names");
const UPDATE = process.env["NAMES_UPDATE"] === "1";
// relative times read the same on every run
const NOW = Date.parse("2026-10-15T17:00:00Z");
const ORG = "/demo";

const BaselineSchema = z.record(
  z.string(),
  z.strictObject({ path: z.string(), names: z.array(z.string()) }),
);
type Baseline = z.infer<typeof BaselineSchema>;

test.describe.configure({ mode: "parallel" });

// a path's route, with record ids as their params
function routeOf(path: string): string | null {
  const parts = path.replace(/\/$/u, "").split("/").slice(1);
  if (parts[0] !== ORG.slice(1)) {
    return null;
  }
  const out = [...parts];
  out[0] = "$orgId";
  const at = (index: number, param: string) => {
    if (out[index] !== undefined) {
      out[index] = param;
    }
  };
  if (parts[1] === "chat") {
    at(2, "$thread");
  }
  if (parts[1] !== "agents") {
    return out.join("/");
  }
  at(2, "$agent");
  const section = parts[3];
  if (section === "issues") {
    at(4, "$issue");
    if (parts[5] === "candidates" && parts[6] !== "compare") {
      at(6, "$candidate");
    }
    if (parts[5] === "debug" && parts[6] === "candidates") {
      at(7, "$candidate");
    }
  } else if (section === "traces") {
    at(4, "$session");
    at(5, "$trace");
  } else if (section === "runs" || section === "jobs") {
    at(4, `$${section.slice(0, -1)}`);
  } else if (section === "evals") {
    at(4, "$eval");
  }
  return out.join("/");
}

// what the accessibility tree names: each line of the aria snapshot with a role and a quoted name
function namesIn(snapshot: string): string[] {
  const names = new Set<string>();
  for (const line of snapshot.split("\n")) {
    const match = /^\s*- ([a-z]+) "((?:[^"\\]|\\.)*)"/u.exec(line);
    if (match !== null) {
      names.add(`${match[1]} ${match[2]}`);
    }
  }
  return [...names].toSorted();
}

// the page once it stops loading: no skeletons, and the same tree twice in a row
async function settledNames(page: Page): Promise<string[]> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.locator('[class*="animate-pulse"]'))
    .toHaveCount(0, { timeout: 15_000 })
    .catch(() => undefined);
  let last: string[] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const names = namesIn(await page.locator("body").ariaSnapshot());
    if (names.join("\n") === last.join("\n")) {
      return names;
    }
    last = names;
    await page.waitForTimeout(400);
  }
  return last;
}

async function links(page: Page): Promise<string[]> {
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""));
  return hrefs
    .filter((href) => href.startsWith(`${ORG}/`) || href === ORG)
    .map((href) => href.split(/[?#]/u)[0] ?? href);
}

function diff(before: Baseline, after: Baseline): string[] {
  const lines: string[] = [];
  for (const route of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const [was, now] = [before[route], after[route]];
    // a page the baseline never reached is listed as a note, since its links can show a moment late
    if (was === undefined) {
      continue;
    }
    if (now === undefined) {
      lines.push(`${route}: not reached`);
      continue;
    }
    const kept = new Set(now.names);
    const old = new Set(was.names);
    lines.push(
      ...was.names.filter((name) => !kept.has(name)).map((name) => `${route}: lost ${name}`),
      ...now.names.filter((name) => !old.has(name)).map((name) => `${route}: gained ${name}`),
    );
  }
  return lines;
}

for (const { agentId } of AGENTS) {
  test(`names on every route of ${agentId}`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.clock.setFixedTime(NOW);
    // Pebble's welcome picks its tagline at random, so it picks the same one on every run
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
    const file = join(DIR, `${agentId}.json`);
    const baseline = existsSync(file)
      ? BaselineSchema.parse(JSON.parse(readFileSync(file, "utf8")))
      : null;
    const agent = `${ORG}/agents/${agentId}`;
    const starts = [
      // a later run visits the pages the baseline named first, so both read the same records
      ...Object.values(baseline ?? {}).map(({ path }) => path),
      `${agent}/issues`,
      `${agent}/traces`,
      `${agent}/evals`,
      `${agent}/automations`,
      `${agent}/settings`,
      `${ORG}/chat`,
      `${ORG}/settings`,
    ];
    const seen: Baseline = {};
    const visited = new Set<string>();
    const queue = [...new Set(starts)];
    while (queue.length > 0) {
      const path = queue.shift() ?? "";
      const route = routeOf(path);
      // another Agent's pages are that Agent's run
      if (
        route === null ||
        visited.has(route) ||
        (path.includes("/agents/") && !path.startsWith(`${agent}/`))
      ) {
        continue;
      }
      visited.add(route);
      await page.goto(path);
      const landed = new URL(page.url()).pathname;
      const names = await settledNames(page);
      const at = routeOf(landed) ?? route;
      if (seen[at] === undefined) {
        seen[at] = { path: landed, names };
      }
      visited.add(at);
      queue.push(...(await links(page)).filter((href) => !visited.has(routeOf(href) ?? "")));
    }
    if (baseline === null || UPDATE) {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file, `${JSON.stringify(seen, null, 2)}\n`);
      test.info().annotations.push({
        type: "baseline",
        description: `${Object.keys(seen).length} routes, ${Object.values(seen).reduce((sum, { names }) => sum + names.length, 0)} names`,
      });
      return;
    }
    const reached = Object.keys(seen).filter((route) => baseline[route] === undefined);
    if (reached.length > 0) {
      test.info().annotations.push({ type: "new routes", description: reached.join(", ") });
    }
    expect(diff(baseline, seen)).toEqual([]);
  });
}
