// demo-data's build output, read from disk the way the dev server serves it at /scenarios
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DEMO_DATA_PUBLIC } from "#scripts/demo-data";
import { AgentCatalogSchema } from "#src/demo/plane/seed/catalog";
import type { Seed } from "#src/demo/plane/seed/types";

export const readScenario = (path: string): unknown =>
  JSON.parse(readFileSync(join(DEMO_DATA_PUBLIC, "scenarios", path), "utf8"));

/** Every Agent in demo-data's catalog. */
export const AGENTS = AgentCatalogSchema.parse(readScenario("index.json")).agents;

/** A fetch that answers `/scenarios/...` from disk, as a stand-in for the dev server. */
export async function scenarioFetch(url: string): Promise<Response> {
  try {
    return new Response(readFileSync(join(DEMO_DATA_PUBLIC, url), "utf8"), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response("missing", { status: 404 });
  }
}

/** A Trace an Issue matched, as the match-issues run's evaluations name it. */
export function matchedTrace(seed: Seed) {
  for (const evaluations of Object.values(seed.evaluations ?? {})) {
    const match = evaluations.find(({ name }) => name.startsWith("grounded/issue/"));
    if (match?.target.kind === "trace") {
      return { issue: match.name.slice("grounded/issue/".length), trace: match.target.trace };
    }
  }
  throw new Error("The seed has no matched Trace");
}
