import { expect, test } from "vitest";

import { turnSpans } from "#/trace-view";
import type { Span, Turn } from "#src/sdk/index";

import { type FlowStep, type StepKind, flowPills, flowSteps, foldPills } from "./trace-flow.tsx";

const span = (id: string, parent: string, attributes: Record<string, string> = {}): Span => ({
  span_id: id,
  parent_span_id: parent,
  name: id,
  service_name: "agent",
  started_at: "2026-10-01T00:00:00Z",
  duration_ns: 1_000_000,
  status_code: "Ok",
  kind: "Internal",
  status_message: "",
  attributes,
  resource_attributes: {},
  events: [],
});

const output = (type: string, content: string) =>
  JSON.stringify([{ role: "assistant", parts: [{ type, content }] }]);

const turn = (spans: Span[]): Turn => ({
  trace_id: "trace-1",
  position: 1,
  name: "turn",
  started_at: "2026-10-01T00:00:00Z",
  duration_ns: 3_000_000,
  status_code: "Ok",
  error_type: "",
  input_tokens: null,
  output_tokens: null,
  annotations: [],
  spans,
});

const tool = (id: string, parent = "root") =>
  span(id, parent, { "gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": id });
const chat = (id: string, type: string, parent = "root") =>
  span(id, parent, { "gen_ai.operation.name": "chat", "gen_ai.output.messages": output(type, id) });

test("a turn's steps read in order, with a subagent's steps in place", () => {
  const steps = flowSteps(
    turnSpans(
      turn([
        span("root", "", {
          "gen_ai.input.messages": JSON.stringify([
            { role: "user", parts: [{ type: "text", content: "Fix it" }] },
          ]),
        }),
        chat("think", "reasoning"),
        { ...span("call", "root", { "gen_ai.operation.name": "chat" }) },
        tool("read"),
        span("helper", "root", { "gen_ai.operation.name": "invoke_agent" }),
        tool("write", "helper"),
        chat("update", "text"),
        chat("answer", "text"),
      ]),
    ),
  );
  expect(steps.map(({ kind, name }) => `${kind}:${name}`)).toEqual([
    "user:User message",
    "model:Reasoning",
    "tool:read",
    "tool:write",
    "agent:Message",
    "agent:Agent response",
  ]);
});

const step = (id: string, kind: StepKind, name = id): FlowStep => ({
  id,
  kind,
  name,
  turn: 1,
  span: undefined,
  errored: false,
});

test("a turn's pills fold a run of one tool and show reasoning only where it must", () => {
  const steps = [
    step("ask", "user", "User"),
    step("think", "model", "Reasoning"),
    step("c1", "tool", "GetComponents"),
    step("v1", "tool", "GetVendorStates"),
    step("v2", "tool", "GetVendorStates"),
    step("v3", "tool", "GetVendorStates"),
    step("c2", "tool", "GetComponents"),
    step("reply", "agent", "Agent"),
  ];
  const pills = flowPills(steps, () => false);
  expect(pills.map(({ name, steps: run }) => `${name}:${run.length}`)).toEqual([
    "GetComponents:1",
    "GetVendorStates:3",
    "GetComponents:1",
    "Agent:1",
  ]);
  expect(pills[1]?.key).toBe("v1");

  const kept = flowPills(steps, ({ id }) => id === "think");
  expect(kept.map(({ name }) => name)).toContain("Reasoning");
});

test("a long turn folds its pills past the cap, keeping every failing one in view", () => {
  const steps = Array.from({ length: 30 }, (_, at) => step(`t${at}`, "tool", `Tool${at}`));
  const pills = flowPills(steps, () => false);
  const folded = foldPills(pills, ({ key }) => key === "t24");
  expect(folded.map((item) => ("more" in item ? `+${item.more}` : item.key)).slice(16)).toEqual([
    "+8",
    "t24",
    "+5",
  ]);
  expect(foldPills(pills.slice(0, 17), () => false)).toHaveLength(17);
});
