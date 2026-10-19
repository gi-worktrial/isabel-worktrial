import { readdirSync } from "node:fs";
import { join } from "node:path";

import { assert, expect, test } from "vitest";

import { DEMO_DATA_PUBLIC } from "#scripts/demo-data";
import { AGENTS, readScenario } from "#test/scenarios";

import { SeedFileSchemas } from "./files.ts";
import { TinyFixtureSchema } from "./fixture.ts";
import { OtlpLogsSchema, OtlpTracesSchema } from "./otlp.ts";

// a seed file at its path, the recorded trials' grades under recordings/
const PATHS: Partial<Record<keyof typeof SeedFileSchemas, string>> = {
  grades: "recordings/grades",
};
const listed = (agentId: string, folder: string) =>
  readdirSync(join(DEMO_DATA_PUBLIC, "scenarios", agentId, "seed", folder)).toSorted();

test.each(AGENTS)(
  "$agentId parses every seed file, OTLP traces and logs included, without changing any value",
  ({ agentId }) => {
    for (const [file, schema] of Object.entries(SeedFileSchemas)) {
      const path = PATHS[file as keyof typeof SeedFileSchemas] ?? file;
      const raw = readScenario(`${agentId}/seed/${path}.json`);
      expect(schema.parse(raw), file).toEqual(raw);
    }
    const traces = listed(agentId, "traces");
    expect(traces.length).toBeGreaterThan(16);
    for (const name of traces) {
      const raw = readScenario(`${agentId}/seed/traces/${name}`);
      expect(OtlpTracesSchema.parse(raw), name).toEqual(raw);
    }
    const raw = readScenario(`${agentId}/seed/recordings/traces.json`);
    expect(OtlpTracesSchema.parse(raw)).toEqual(raw);
    for (const name of listed(agentId, "logs")) {
      const logs = readScenario(`${agentId}/seed/logs/${name}`);
      expect(OtlpLogsSchema.parse(logs), name).toEqual(logs);
    }
  },
);

test("the shared tiny fixture contract preserves every fact and complete seed record", () => {
  const raw = readScenario("tiny/fixture.json");
  expect(TinyFixtureSchema.parse(raw)).toEqual(raw);
});

test("an unknown fixed record field is rejected rather than silently discarded", () => {
  const fixture = TinyFixtureSchema.parse(readScenario("tiny/fixture.json"));
  const pull = fixture.seed.pulls[0];
  assert(pull !== undefined);
  expect(() => SeedFileSchemas.pulls.parse([{ ...pull, unread: "must not disappear" }])).toThrow();
});
