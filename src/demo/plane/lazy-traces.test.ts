import { afterEach, expect, test, vi } from "vitest";

import { RUN_EVALS_JOB } from "#src/sdk/index";
import { AGENTS, matchedTrace, scenarioFetch } from "#test/scenarios";

import { emptyLayer, memoryClient } from "./client.ts";
import { scenarioFiles } from "./load.ts";

afterEach(() => vi.unstubAllGlobals());

const AGENT = AGENTS[0]?.agentId ?? "";

test("Trace lists use the small index and detailed spans load when opened", async () => {
  const requested: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requested.push(url);
    return scenarioFetch(url);
  });
  const { seed } = await scenarioFiles(AGENT, "org-one");
  const client = memoryClient(seed, emptyLayer());
  const at = { agent: seed.agent, repo: seed.agent, id: matchedTrace(seed).issue };
  const { traces } = await client.issues.listTraces(at);
  expect(traces.length).toBeGreaterThan(0);
  expect(traces.every((trace) => trace.input.length > 0 && trace.session_id !== "")).toBe(true);
  const page = (after?: string) => client.issues.listTraces({ ...at, limit: 2, after });
  const first = await page();
  expect(first.next).toBeDefined();
  expect((await page(first.next)).traces[0]?.trace_id).not.toBe(first.traces[0]?.trace_id);
  const [run] = await client.jobs.listRuns({
    agent: seed.agent,
    job: RUN_EVALS_JOB,
    status: "completed",
  });
  const { results } = await client.evals.getRun({ agent: seed.agent, run: run?.id ?? "" });
  expect(results.length).toBeGreaterThan(0);
  expect(requested.some((url) => url.includes("/seed/traces/"))).toBe(false);

  const trace = await client.agents.getTrace({
    agent: seed.agent,
    trace: traces[0]?.trace_id ?? "",
  });
  expect(trace.spans.length).toBeGreaterThan(1);
  const trial = await client.agents.getTrace({
    agent: seed.agent,
    trace: results[0]?.trials[0]?.trace_id ?? "",
  });
  expect(trial.spans.length).toBeGreaterThan(1);
  const turns = (after?: string) =>
    client.agents.getSession({
      agent: seed.agent,
      session: traces[0]?.session_id ?? "",
      limit: 2,
      after,
    });
  const session = await turns();
  expect(session.turns.every((turn) => turn.spans.length > 1)).toBe(true);
  expect(requested.some((url) => url.includes("/seed/traces/"))).toBe(true);
});

test("Eval trials are listed apart, named by their Eval and graded by its Criteria", async () => {
  vi.stubGlobal("fetch", scenarioFetch);
  const { seed } = await scenarioFiles(AGENT, "org-one");
  const client = memoryClient(seed, emptyLayer());
  const { traces } = await client.agents.listTraces({ agent: seed.agent, trial: true, limit: 50 });
  expect(traces.length).toBeGreaterThan(0);
  for (const trial of traces) {
    expect(trial.task_name).not.toBe("");
    expect(
      trial.annotations.some((annotation) => annotation.name === "grounded/grade/reward"),
    ).toBe(true);
  }
  const production = await client.agents.listTraces({ agent: seed.agent, limit: 50 });
  expect(production.traces.every((trace) => trace.task_name === "")).toBe(true);
});

test("a scenario uses the selected Org and keeps its writes separate", async () => {
  vi.stubGlobal("fetch", scenarioFetch);
  const first = await scenarioFiles(AGENT, "org-one");
  const second = await scenarioFiles(AGENT, "org-two");
  const firstClient = memoryClient(first.seed, emptyLayer());
  const secondClient = memoryClient(second.seed, emptyLayer());
  await firstClient.pebble.threads.create({ title: "first Org" });
  expect(first.seed.org_id).toBe("org-one");
  expect(second.seed.org_id).toBe("org-two");
  expect((await secondClient.pebble.threads.list()).threads).toEqual([]);
});

test("a failed detail bucket can load again after its HTTP response recovers", async () => {
  const requested: string[] = [];
  let failed = false;
  vi.stubGlobal("fetch", async (url: string) => {
    requested.push(url);
    if (url.includes("/seed/traces/") && !failed) {
      failed = true;
      return new Response("unavailable", { status: 503 });
    }
    return scenarioFetch(url);
  });
  const { seed } = await scenarioFiles(AGENT, "org-one");
  const client = memoryClient(seed, emptyLayer());
  const { trace: id } = matchedTrace(seed);
  const read = () => client.agents.getTrace({ agent: seed.agent, trace: id });
  await expect(read()).rejects.toThrow("seed/traces/");
  const trace = await read();
  expect(trace.trace_id).toBe(id);
  expect(trace.spans.length).toBeGreaterThan(1);
  expect(requested.filter((url) => url.includes("/seed/traces/"))).toHaveLength(2);
});
