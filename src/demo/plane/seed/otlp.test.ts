import { expect, test } from "vitest";

import type { Trace } from "#src/sdk/index";

import {
  decodeEvaluations,
  decodeTraces,
  encodeEvaluations,
  encodeTraces,
  isoNanos,
  nanosIso,
} from "./otlp.ts";

const SCOPE = { name: "demo-data", version: "1" };
const resource = (version: string) => ({
  "service.name": "agent",
  "service.version": version,
  "deployment.environment.name": "production",
});

const trace: Trace = {
  trace_id: "a".repeat(32),
  spans: [
    {
      span_id: "1".repeat(16),
      parent_span_id: "",
      name: "invoke_agent",
      service_name: "agent",
      started_at: "2026-10-01T00:00:00.000000001Z",
      duration_ns: 2_500_000_000,
      status_code: "Unset",
      kind: "Internal",
      status_message: "",
      attributes: { "gen_ai.conversation.id": "session", "gen_ai.usage.input_tokens": "12" },
      resource_attributes: resource("1.0.0"),
      events: [],
    },
    {
      span_id: "2".repeat(16),
      parent_span_id: "1".repeat(16),
      name: "execute_tool Bash",
      service_name: "agent",
      started_at: "2026-10-01T00:00:01.250000000Z",
      duration_ns: 40_000_000,
      status_code: "Error",
      kind: "Client",
      status_message: "exit 1",
      attributes: { "gen_ai.tool.name": "Bash" },
      resource_attributes: resource("1.0.0"),
      events: [
        { timestamp: "2026-10-01T00:00:01.260000000Z", name: "retry", attributes: { n: "1" } },
      ],
    },
  ],
};

test("times keep their nanoseconds both ways", () => {
  expect(String(isoNanos("2026-10-01T00:00:00.000000001Z"))).toBe("1790812800000000001");
  expect(nanosIso(isoNanos("2026-10-01T00:00:01.25Z"))).toBe("2026-10-01T00:00:01.250000000Z");
});

test("Traces round-trip through one ExportTraceServiceRequest grouped by resource", () => {
  const other = {
    ...trace,
    trace_id: "b".repeat(32),
    spans: trace.spans.slice(0, 1).map((span) => ({
      ...span,
      resource_attributes: resource("2.0.0"),
    })),
  };
  const body = encodeTraces([trace, other], SCOPE);
  expect(body.resourceSpans).toHaveLength(2);
  expect(body.resourceSpans[0]!.scopeSpans[0]!.spans[1]).toMatchObject({
    kind: 3,
    status: { code: 2, message: "exit 1" },
    parentSpanId: "1".repeat(16),
  });
  expect(body.resourceSpans[0]!.scopeSpans[0]!.spans[0]).not.toHaveProperty("parentSpanId");
  expect(decodeTraces(body)).toEqual([trace, other]);
});

test("evaluations round-trip as the records evaluationRecord builds", () => {
  const evaluations = [
    { target: { kind: "trace" as const, trace: "a".repeat(32) }, name: "outcome", label: "fail" },
    {
      target: { kind: "trace" as const, trace: "a".repeat(32), span: "2".repeat(16) },
      name: "grounded/grade/reward/uses-bash",
      value: 0,
      label: "fail",
      explanation: "It never ran the tests.",
      description: "Runs the tests",
      raw: "false",
    },
  ];
  const body = encodeEvaluations(evaluations, SCOPE);
  expect(body.resourceLogs[0]!.scopeLogs[0]!.logRecords[0]).toMatchObject({
    eventName: "gen_ai.evaluation.result",
    traceId: "a".repeat(32),
  });
  expect(decodeEvaluations(body)).toEqual(
    evaluations.map((evaluation) => ({
      span: undefined,
      value: undefined,
      explanation: undefined,
      description: undefined,
      raw: undefined,
      ...evaluation,
      target: { span: undefined, ...evaluation.target },
    })),
  );
});
