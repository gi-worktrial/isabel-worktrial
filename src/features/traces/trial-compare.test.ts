import { expect, test } from "vitest";

import { sessionGrades, turnSpans } from "#/trace-view";
import type { Annotation, Span, Turn } from "#src/sdk/index";

import { gradeLocation, locationText } from "./failure.tsx";
import { type TrialOption, comparedTrials, trialLabels } from "./trial-compare.tsx";

const option = (session: string, outcome: "pass" | "fail", task = "e1") => ({
  session,
  eval: task,
  label: session,
  annotations: [{ name: "grounded/grade/reward", label: outcome }],
});

const compared = (picked: string[] | undefined, options: readonly TrialOption[]) =>
  comparedTrials(picked, options).map(({ session }) => session);

const options = [
  option("p1", "pass", "e1"),
  option("f2", "fail", "e2"),
  option("f1", "fail", "e1"),
  option("p2", "pass", "e2"),
];

test("the default sets the first failing trial beside a passing trial of the same Eval", () => {
  expect(compared(undefined, options)).toEqual(["f2", "p2"]);
});

test("a failing trial without a passing one in its Eval sits beside any passing trial", () => {
  const others = [
    option("f1", "fail", "e1"),
    option("f2", "fail", "e2"),
    option("p3", "pass", "e3"),
  ];
  expect(compared(undefined, others)).toEqual(["f1", "p3"]);
});

test("trials of one outcome compare the first two, and a lone trial shows alone", () => {
  expect(compared(undefined, [option("a", "pass"), option("b", "pass")])).toEqual(["a", "b"]);
  expect(compared(undefined, [option("a", "fail"), option("b", "fail")])).toEqual(["a", "b"]);
  expect(compared(undefined, [option("a", "pass")])).toEqual(["a"]);
  expect(compared(undefined, [])).toEqual([]);
});

test("picked trials keep their order, drop unlisted ones and stop at two", () => {
  expect(compared(["x", "p2", "p2", "f1", "f2"], options)).toEqual(["p2", "f1"]);
  expect(compared([], options)).toEqual(["f2", "p2"]);
});

test("one picked trial gets the partner the default would give it", () => {
  expect(compared(["p1"], options)).toEqual(["p1", "f1"]);
});

test("a repeated label is numbered", () => {
  expect(trialLabels(["e1", "e2", "e1"])).toEqual(["e1 #1", "e2", "e1 #2"]);
});

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

const said = (role: string, text: string) =>
  JSON.stringify([{ role, parts: [{ type: "text", content: text }] }]);

const turn = (position: number, labels: string[], spans: Span[]): Turn => ({
  trace_id: `trace-${position}`,
  position,
  name: "turn",
  started_at: "2026-10-01T00:00:00Z",
  duration_ns: 3_000_000,
  status_code: "Ok",
  error_type: "",
  input_tokens: null,
  output_tokens: null,
  annotations: labels.map((label) => ({ name: "grounded/grade/reward", label })),
  spans,
});

const tool = (id: string, extra: Partial<Span> = {}) => ({
  ...span(id, "root", { "gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": id }),
  ...extra,
});

const root = span("root", "", {
  "gen_ai.input.messages": said("user", "Fix it"),
  "gen_ai.output.messages": said("assistant", "Done"),
});

const turns = [
  turn(1, ["pass"], [root, tool("read")]),
  turn(
    2,
    ["fail"],
    [
      { ...root, span_id: "root2" },
      {
        ...tool("write", { status_code: "Error", status_message: "denied" }),
        parent_span_id: "root2",
      },
    ],
  ),
];
const views = turns.map(turnSpans);

const grade = (label: string, trace_id = "", span_id = ""): Annotation => ({
  trace_id,
  span_id,
  session_id: "",
  name: "grounded/grade/reward",
  value: null,
  label,
  explanation: "",
  description: "",
  raw: "",
  source: { kind: "code", id: "grader", commit: "" },
  attributes: {},
  annotated_at: "2026-10-01T00:00:00Z",
});

// where a Grade points, as the session page's Grades read it
const located = (annotation: Annotation) =>
  gradeLocation(views, sessionGrades([annotation], turns).criteria[0] ?? { step: undefined });

test("a Grade naming a rendered step points at it", () => {
  expect(located(grade("pass", "trace-1", "read"))).toEqual({ id: "read", turn: 1, name: "read" });
});

test("a failing Grade on a failing turn points at its errored tool call", () => {
  expect(located(grade("fail", "trace-2"))).toEqual({ id: "write", turn: 2, name: "write" });
});

test("a failing Grade on a failing turn without errors points at its reply", () => {
  const failing = [turn(1, ["fail"], [root, tool("read")])];
  const [criterion] = sessionGrades([grade("fail", "trace-1")], failing).criteria;
  expect(gradeLocation(failing.map(turnSpans), criterion ?? { step: undefined })).toEqual({
    id: "root",
    turn: 1,
    name: "Agent response",
  });
});

test("a failing Grade on the whole session points at its first failing turn", () => {
  expect(located(grade("fail"))?.turn).toBe(2);
});

test("a passing Grade points only where it names a step", () => {
  expect(located(grade("pass", "trace-2"))).toBeUndefined();
});

test("a location names its turn only when there are several", () => {
  const location = { id: "write", turn: 2, name: "write" };
  expect(locationText(location, 1)).toBe("write");
  expect(locationText(location, 3)).toBe("write in Turn 2");
});
