import { afterEach, assert, expect, test, vi } from "vitest";
import { ZodError } from "zod";

import { AGENTS, matchedTrace, readScenario, scenarioFetch } from "#test/scenarios";

import { scenarioFiles } from "./load.ts";
import { OtlpTracesSchema, decodeTraces } from "./seed/otlp.ts";

afterEach(() => vi.unstubAllGlobals());

const AGENT = AGENTS[0]?.agentId ?? "";
const invalidFiles = [
  ["repo", {}],
  ["pulls", [{}]],
  ["traces", [{}]],
  ["runs", [{}]],
  ["outcomes", { agent: { task: {} } }],
  ["recordings/grades", { trace: { criterion: {} } }],
  ["jobs", { job: {} }],
  ["scenario", {}],
] as const;

test.each(invalidFiles)(
  "rejects an invalid %s file before exposing a seed",
  async (file, value) => {
    vi.stubGlobal("fetch", (url: string) =>
      url.endsWith(`/seed/${file}.json`)
        ? Promise.resolve(Response.json(value))
        : scenarioFetch(url),
    );
    await expect(scenarioFiles(AGENT, "org-one").then(() => undefined)).rejects.toBeInstanceOf(
      ZodError,
    );
  },
);

test.each(AGENTS)(
  "loading $agentId preserves every eager file value and count",
  async ({ agentId }) => {
    vi.stubGlobal("fetch", scenarioFetch);
    const { seed } = await scenarioFiles(agentId, "org-one");
    for (const file of ["repo", "pulls", "runs", "outcomes", "jobs"] as const) {
      expect(seed[file]).toEqual(readScenario(`${agentId}/seed/${file}.json`));
    }
    expect(seed.grades).toEqual(readScenario(`${agentId}/seed/recordings/grades.json`));
    const annotated = seed.runs.filter((run) => run.annotated === true);
    expect(annotated.length).toBeGreaterThan(0);
    expect(Object.keys(seed.evaluations ?? {}).toSorted()).toEqual(
      annotated.map((run) => run.id).toSorted(),
    );
  },
);

test("a malformed OTLP traces file rejects, retries, and shares its decoded traces", async () => {
  let bucketRequests = 0;
  vi.stubGlobal("fetch", (url: string) => {
    if (url.includes("/seed/traces/")) {
      bucketRequests += 1;
      if (bucketRequests === 1) {
        return Promise.resolve(Response.json({ resourceSpans: [{ spans: [{}] }] }));
      }
    }
    return scenarioFetch(url);
  });
  const { seed } = await scenarioFiles(AGENT, "org-one");
  const { trace: id } = matchedTrace(seed);
  assert(seed.loadTrace !== undefined);
  await expect(seed.loadTrace(id)).rejects.toBeInstanceOf(ZodError);
  const [first, second] = await Promise.all([seed.loadTrace(id), seed.loadTrace(id)]);
  const raw = OtlpTracesSchema.parse(readScenario(`${AGENT}/seed/traces/${id.slice(0, 2)}.json`));
  expect(first).toEqual(decodeTraces(raw).find((trace) => trace.trace_id === id));
  expect(second).toBe(first);
  expect(bucketRequests).toBe(2);
  expect(await seed.loadTrace("not-hex")).toBeUndefined();
  expect(bucketRequests).toBe(2);
});

test.each([404, 200])(
  "missing or HTML scenario files retain the loading error (%s)",
  async (status) => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("<html>offline</html>", { status })));
    await expect(scenarioFiles("agent/with space", "org-one")).rejects.toThrow(
      "No /scenarios/agent%2Fwith%20space/seed/scenario.json, so run pnpm build in demo-data.",
    );
  },
);
