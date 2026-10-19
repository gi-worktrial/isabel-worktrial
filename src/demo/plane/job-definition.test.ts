import { stringify } from "smol-toml";
import { describe, expect, it } from "vitest";

import { decodeJobDefinition, resolveInputs, stepName } from "./job-definition.ts";

// platform requires at least one step since PR133
const steps = [{ run: "true" }];
const STEP = '\n[[steps]]\nrun = "true"\n';

describe("PR113, PR133 and PR144 native job definitions", () => {
  it("uses native defaults and does not add manual dispatch to an explicit trigger table", () => {
    expect(decodeJobDefinition(STEP)).toEqual({
      "on": { workflow_dispatch: {} },
      "inputs": {},
      "permissions": { repo: "read", agent: "read" },
      "concurrency": { "group": "{job}-{trigger}-{ref}", "cancel-in-progress": false },
      "timeout-minutes": 60,
      "concurrent-sandboxes": 0,
      "vcpus": 2,
      "mem-mib": 4096,
      "steps": [{ "run": "true", "exclude-from-context": false }],
    });
    expect(decodeJobDefinition(`[on]\n${STEP}`).on).toEqual({});
    expect(decodeJobDefinition(`[on.push]\npaths = ["agent/**"]\n${STEP}`).on).toEqual({
      push: { paths: ["agent/**"] },
    });
  });

  it.each([
    { description: "product metadata" },
    { enabled: false },
    { timezone: "UTC" },
    { timeout_minutes: 30 },
    { concurrent_sandboxes: 1 },
    { permissions: ["repo:read"] },
    { permissions: { job: "run" } },
    { permissions: { trace: "read" } },
    { concurrency: "job-{ref}" },
    { concurrency: { group: "{missing}" } },
    { concurrency: { group: "{inputs.missing}" } },
    { "timeout-minutes": 331 },
    { "timeout-minutes": 0 },
    { "concurrent-sandboxes": 1 },
    { on: { schedule: { cron: "0 2 * * *" } } },
    { on: { schedule: [{ cron: "0 2 * * *", timezone: "UTC" }] } },
    { on: { workflow_dispatch: { inputs: {} } } },
    { inputs: { Bad: { type: "string" } } },
    { inputs: { sample: { type: "number", default: "1" } } },
    { inputs: { tags: { type: "array", default: [1] } } },
    { inputs: { mode: { type: "choice", options: [] } } },
    { inputs: { mode: { type: "choice", options: ["all"], default: "some" } } },
    { inputs: { text: { type: "string", options: ["all"] } } },
    { vcpus: 0 },
    { "mem-mib": 512.5 },
    { steps: [] },
    { steps: [{ name: "No command" }] },
    { steps: [{ run: "true", shell: "sh" }] },
  ])("rejects native-invalid configuration %j", (fields) => {
    expect(() => decodeJobDefinition(stringify({ steps, ...fields }))).toThrow();
  });

  it("requires steps, named after their run when they have no name, and reads sizes", () => {
    expect(() => decodeJobDefinition("")).toThrow();
    const definition = decodeJobDefinition(
      stringify({
        "vcpus": 2,
        "mem-mib": 4096,
        "steps": [{ name: "Grade", run: "grade" }, { run: "report" }],
      }),
    );
    expect(definition).toMatchObject({ "vcpus": 2, "mem-mib": 4096 });
    expect(definition.steps).toEqual([
      { "name": "Grade", "run": "grade", "exclude-from-context": false },
      { "run": "report", "exclude-from-context": false },
    ]);
  });

  it("takes prompt steps for Pebble only with a model, model read and sandbox write, as platform's PR144 does", () => {
    const prompted = {
      model: "gpt-6-astra",
      permissions: { model: "read", sandbox: "write" },
      steps: [
        { run: "grade" },
        { "name": "Review", "prompt-file": "jobs/annotate/review.md" },
        { prompt: "Sum up" },
      ],
    };
    const definition = decodeJobDefinition(stringify(prompted));
    expect(definition.steps.map(stepName)).toEqual(["grade", "Review", "Sum up"]);
    expect(definition.steps[0]).toMatchObject({ "exclude-from-context": false });
    for (const missing of [
      { ...prompted, model: undefined },
      { ...prompted, permissions: { sandbox: "write" } },
      { ...prompted, permissions: { model: "read" } },
    ]) {
      expect(() => decodeJobDefinition(stringify(JSON.parse(JSON.stringify(missing))))).toThrow(
        /prompt steps need/u,
      );
    }
    expect(() => decodeJobDefinition(stringify({ steps: [{ run: "a", prompt: "b" }] }))).toThrow();
  });

  it("accepts native permission tables, sandbox refinement and declared input placeholders", () => {
    const definition = decodeJobDefinition(
      stringify({
        steps,
        "timeout-minutes": 330,
        "concurrent-sandboxes": 2,
        "permissions": { repo: "write", sandbox: "write", job: "write", model: "read" },
        "inputs": { sample: { type: "number", default: 0.2 } },
        "concurrency": {
          "group": "{job}-{trigger}-{ref}-{inputs.sample}",
          "cancel-in-progress": true,
        },
        "on": {
          workflow_dispatch: {},
          schedule: [{ cron: "0 2 * * *" }, { cron: "0 4 * * *" }],
          push: { "branches-ignore": ["draft/**"], "paths-ignore": ["docs/**"] },
        },
      }),
    );
    expect(definition.permissions).toEqual({
      repo: "write",
      sandbox: "write",
      job: "write",
      model: "read",
    });
    expect(definition.on.schedule).toHaveLength(2);
    expect(definition["concurrent-sandboxes"]).toBe(2);
  });

  it("enforces native input names and the 50-input limit", () => {
    const inputs = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [`input_${index}`, { type: "string" }]),
    );
    expect(Object.keys(decodeJobDefinition(stringify({ inputs, steps })).inputs)).toHaveLength(50);
    expect(() =>
      decodeJobDefinition(stringify({ inputs: { ...inputs, extra: { type: "string" } }, steps })),
    ).toThrow(/50 inputs/u);
    expect(() =>
      decodeJobDefinition(stringify({ inputs: { ["a".repeat(64)]: { type: "string" } }, steps })),
    ).toThrow();
  });
});

describe("native dispatch inputs", () => {
  const { inputs } = decodeJobDefinition(
    stringify({
      inputs: {
        text: { type: "string", required: true },
        count: { type: "number", default: 2 },
        enabled: { type: "boolean", default: true },
        mode: { type: "choice", options: ["all", "sample"], default: "all" },
        tags: { type: "array", default: ["new"] },
      },
      steps,
    }),
  );

  it("fills defaults and preserves explicit false, zero and empty arrays", () => {
    expect(resolveInputs(inputs, { text: "", count: 0, enabled: false, tags: [] })).toEqual({
      text: "",
      count: 0,
      enabled: false,
      mode: "all",
      tags: [],
    });
    expect(resolveInputs(inputs, { text: "given" })).toEqual({
      text: "given",
      count: 2,
      enabled: true,
      mode: "all",
      tags: ["new"],
    });
  });

  it("rejects missing, unknown and mistyped inputs", () => {
    expect(() => resolveInputs(inputs, {})).toThrow("Input text is required");
    expect(() => resolveInputs(inputs, { text: "given", unknown: "value" })).toThrow(
      "Unknown input unknown",
    );
    expect(() => resolveInputs(inputs, { text: "given", mode: "other" })).toThrow("Input mode:");
    expect(() => resolveInputs(inputs, { text: "given", count: Number.NaN })).toThrow(
      "Input count:",
    );
    expect(() => resolveInputs(inputs, { text: "given", enabled: "false" })).toThrow(
      "Input enabled:",
    );
  });
});
