import { expect, test } from "vitest";

import type { JobRun, Span, Trace } from "#src/sdk/index";

import { modelUsage, summedUsage } from "./models.ts";
import type { Played } from "./runs.ts";

const span = (id: string, attributes: Record<string, string>): Span => ({
  span_id: id,
  parent_span_id: id === "root" ? "" : "root",
  name: id,
  service_name: "agent",
  started_at: "2026-10-10T10:00:00.000000000Z",
  duration_ns: 1,
  status_code: "Unset",
  kind: "Internal",
  status_message: "",
  attributes,
  resource_attributes: {},
  events: [],
});
const chat = (id: string, input: number, output: number) =>
  span(id, {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": "openai",
    "gen_ai.request.model": "model-a",
    "gen_ai.usage.input_tokens": String(input),
    "gen_ai.usage.output_tokens": String(output),
  });
const recorded: Trace = {
  trace_id: "recorded",
  spans: [
    span("root", { "gen_ai.operation.name": "invoke_agent", "gen_ai.request.model": "model-a" }),
    chat("first", 100, 10),
    span("tool", { "gen_ai.operation.name": "execute_tool" }),
    chat("second", 150, 20),
  ],
};
const trial = (started_at: string) => ({
  trial: `task__${started_at}`,
  task: "task",
  recorded: "recorded",
  started_at,
  finished_at: started_at,
  cost_usd: 0.5,
});
const runs: Played[] = [
  {
    // SAFETY: usage reads only a run's trials
    run: {} as JobRun,
    trials: [trial("2026-10-10T03:00:00Z"), trial("2026-08-01T03:00:00Z")],
    logs: [],
  },
];
const now = Date.parse("2026-10-16T12:00:00Z");

test("settings answer the models trials called and their usage over the range from the recordings' chat spans", async () => {
  const usage = modelUsage(
    () => runs,
    async (id) => (id === recorded.trace_id ? recorded : undefined),
    () => now,
  );
  expect((await usage.models()).map(({ name, model, owner }) => ({ name, model, owner }))).toEqual([
    { name: "model-a", model: "openai/model-a", owner: "shared" },
  ]);
  // the default range is the 30 days before today, so the August trial is left out
  const recent = await usage.usage();
  expect(recent).toEqual({
    start: "2026-09-16",
    end: "2026-10-16",
    models: [
      { model: "model-a", api_requests: 2, prompt_tokens: 250, completion_tokens: 30, spend: 0.5 },
    ],
  });
  const all = await usage.usage({ start: "2026-08-01" });
  expect(all.models[0]?.api_requests).toBe(4);
  expect(summedUsage([recent, all], { start: "2026-08-01", end: "2026-10-16" }).models).toEqual([
    { model: "model-a", api_requests: 6, prompt_tokens: 750, completion_tokens: 90, spend: 1.5 },
  ]);
});
