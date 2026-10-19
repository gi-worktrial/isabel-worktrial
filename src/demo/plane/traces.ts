// the agents service's trace, session and annotation reads over the seed's spans and annotation log
import {
  type Annotation,
  type AnnotationCounts,
  type ListedTrace,
  type ListTracesOptions,
  messageText,
  type SessionSummary,
  type Span,
  spanMessages,
  type Trace,
  type TraceSummary,
  type Turn,
} from "#src/sdk/index";

import type { IndexRow } from "./seed/traces.ts";

export const RUN_ATTRIBUTE = "grounded.job_run.id";
export const TRIAL_ATTRIBUTE = "grounded.trial.id";
export const TASK_ATTRIBUTE = "grounded.task.name";
export const CONVERSATION_ATTRIBUTE = "gen_ai.conversation.id";

type Filters = Pick<ListTracesOptions, "annotation" | "attribute" | "q" | "trial" | "trace">;
type Row = { name: string; label: string };

export function rootOf(trace: Trace): Span {
  const root = trace.spans.find((span) => span.parent_span_id === "");
  if (root === undefined) {
    throw new Error(`Trace ${trace.trace_id} has no root span`);
  }
  return root;
}

// a span's attribute, or its resource's, as the store indexes both
// platform reads a trial's keys from the root's span attributes, never its resource
const attributeOf = (span: Span, key: string) => span.attributes[key];

const sessionOf = (trace: Trace) =>
  trace.spans.map((span) => span.attributes[CONVERSATION_ATTRIBUTE]).find(Boolean) ??
  trace.trace_id;

const isTrial = (trace: Trace) => attributeOf(rootOf(trace), RUN_ATTRIBUTE) !== undefined;

/** A recorded trial trace, which each run that plays it gets a session of. */
export const isRecording = (trace: Trace) =>
  attributeOf(rootOf(trace), TASK_ATTRIBUTE) !== undefined && !isTrial(trace);

function summaryOf(trace: Trace): TraceSummary {
  const { name, service_name, started_at, duration_ns, status_code } = rootOf(trace);
  return { trace_id: trace.trace_id, name, service_name, started_at, duration_ns, status_code };
}

const tokens = (span: Span, key: string) =>
  span.attributes[key] === undefined ? null : Number(span.attributes[key]);
const sum = (values: Array<number | null>) =>
  values.some((value) => value !== null)
    ? values.reduce<number>((total, value) => total + (value ?? 0), 0)
    : null;

/** The current annotations, indexed by trace and by session. */
export class AnnotationIndex {
  private readonly byTrace = new Map<string, Annotation[]>();
  private readonly bySession = new Map<string, Annotation[]>();

  constructor(readonly all: readonly Annotation[]) {
    for (const row of all) {
      if (row.trace_id !== "") {
        this.byTrace.set(row.trace_id, [...(this.byTrace.get(row.trace_id) ?? []), row]);
      }
      if (row.session_id !== "") {
        this.bySession.set(row.session_id, [...(this.bySession.get(row.session_id) ?? []), row]);
      }
    }
  }

  ofTrace(trace: string): Annotation[] {
    return this.byTrace.get(trace) ?? [];
  }

  ofSession(session: string, traces: readonly string[]): Annotation[] {
    // an annotation on a trace of the session can carry both ids, so it counts once
    return [
      ...new Set([
        ...(this.bySession.get(session) ?? []),
        ...traces.flatMap((id) => this.ofTrace(id)),
      ]),
    ];
  }
}

/** The distinct labels of some annotations, as list rows carry them. */
export const rowsOf = (annotations: readonly Annotation[]): Row[] => [
  ...new Map(
    annotations.map(({ name, label }) => [`${name}:${label}`, { name, label }] as const),
  ).values(),
];

const hasEvery = (rows: readonly Row[], pairs: readonly string[] | undefined) =>
  (pairs ?? []).every((pair) => rows.some(({ name, label }) => `${name}:${label}` === pair));

const spansHaveEvery = (traces: readonly Trace[], pairs: readonly string[] | undefined) =>
  (pairs ?? []).every((pair) => {
    const at = pair.indexOf(":");
    const [key, value] = [pair.slice(0, at), pair.slice(at + 1)];
    return traces.some((trace) => trace.spans.some((span) => attributeOf(span, key) === value));
  });

// a trace's input as search reads it, parsed once since search runs on every keystroke
const searchable = new WeakMap<Trace, string>();
const inputText = (trace: Trace) => {
  let text = searchable.get(trace);
  if (text === undefined) {
    text = messageText(spanMessages(rootOf(trace), "gen_ai.input.messages")).toLowerCase();
    searchable.set(trace, text);
  }
  return text;
};

const matchesText = (traces: readonly Trace[], q: string | undefined) => {
  const text = q?.trim().toLowerCase() ?? "";
  return (
    text === "" ||
    traces.some((trace) => trace.trace_id.startsWith(text) || inputText(trace).includes(text))
  );
};

/** Whether a trace or session (its traces and labels) passes the agents service's filters. */
export function passes(traces: readonly Trace[], rows: readonly Row[], filters: Filters) {
  return (
    hasEvery(rows, filters.annotation) &&
    spansHaveEvery(traces, filters.attribute) &&
    matchesText(traces, filters.q) &&
    (filters.trial === undefined || traces.some(isTrial) === filters.trial) &&
    (filters.trace === undefined ||
      traces.some((trace) => filters.trace?.includes(trace.trace_id) === true))
  );
}

export function listedOf(trace: Trace, annotations: AnnotationIndex): ListedTrace {
  const root = rootOf(trace);
  return {
    ...summaryOf(trace),
    session_id: sessionOf(trace),
    task_name: attributeOf(root, TASK_ATTRIBUTE) ?? "",
    input: spanMessages(root, "gen_ai.input.messages"),
    annotations: rowsOf(annotations.ofTrace(trace.trace_id)),
  };
}

export function turnOf(trace: Trace, position: number, annotations: AnnotationIndex): Turn {
  const root = rootOf(trace);
  return {
    trace_id: trace.trace_id,
    position,
    name: root.name,
    started_at: root.started_at,
    duration_ns: root.duration_ns,
    status_code: root.status_code,
    error_type: root.attributes["error.type"] ?? "",
    input_tokens: tokens(root, "gen_ai.usage.input_tokens"),
    output_tokens: tokens(root, "gen_ai.usage.output_tokens"),
    annotations: rowsOf(annotations.ofTrace(trace.trace_id)),
    spans: trace.spans,
  };
}

/** Traces grouped by `gen_ai.conversation.id`, each session's turns in start order. */
export function sessionsOf(traces: Iterable<Trace>): Map<string, Trace[]> {
  const sessions = new Map<string, Trace[]>();
  for (const trace of traces) {
    const id = sessionOf(trace);
    sessions.set(id, [...(sessions.get(id) ?? []), trace]);
  }
  for (const turns of sessions.values()) {
    turns.sort((left, right) => rootOf(left).started_at.localeCompare(rootOf(right).started_at));
  }
  return sessions;
}

export function sessionSummary(
  id: string,
  turns: readonly Trace[],
  annotations: AnnotationIndex,
): SessionSummary {
  const roots = turns.map(rootOf);
  const first = roots[0];
  const last = roots.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error(`Session ${id} has no turns`);
  }
  const end = Date.parse(last.started_at) + last.duration_ns / 1e6;
  const messages = (key: "gen_ai.input.messages" | "gen_ai.output.messages") =>
    roots.map((root) => spanMessages(root, key)).filter((list) => list.length > 0);
  return {
    session_id: id,
    started_at: first.started_at,
    last_turn_at: last.started_at,
    duration_ns: Math.max(0, (end - Date.parse(first.started_at)) * 1e6),
    turns: turns.length,
    errors: roots.filter((root) => root.status_code === "Error").length,
    input_tokens: sum(roots.map((root) => tokens(root, "gen_ai.usage.input_tokens"))),
    output_tokens: sum(roots.map((root) => tokens(root, "gen_ai.usage.output_tokens"))),
    first_input: messages("gen_ai.input.messages")[0] ?? [],
    last_output: messages("gen_ai.output.messages").at(-1) ?? [],
    annotations: rowsOf(
      annotations.ofSession(
        id,
        turns.map((turn) => turn.trace_id),
      ),
    ),
  };
}

/** A page after the row with ID `after`, as the agents service pages by the previous page's last ID. */
export function page<Value>(
  rows: readonly Value[],
  id: (row: Value) => string,
  limit = 50,
  after?: string | undefined,
) {
  const start = after === undefined ? 0 : rows.findIndex((row) => id(row) === after) + 1;
  return { rows: rows.slice(start, start + limit), has_more: start + limit < rows.length };
}

/** Each current `name:label` pair with the traces it's on and when they started. */
export function annotationCounts(
  annotations: readonly Annotation[],
  startedAt: (trace: string) => string | undefined,
): AnnotationCounts {
  const groups = new Map<string, { name: string; label: string; traces: Set<string> }>();
  for (const { name, label, trace_id } of annotations) {
    if (trace_id !== "") {
      const key = `${name}:${label}`;
      const group = groups.get(key) ?? { name, label, traces: new Set<string>() };
      group.traces.add(trace_id);
      groups.set(key, group);
    }
  }
  return {
    counts: [...groups.values()].map(({ name, label, traces }) => {
      const times = [...traces].flatMap((id) => startedAt(id) ?? []).toSorted();
      return {
        name,
        label,
        traces: traces.size,
        first_seen_at: times[0] ?? "",
        last_seen_at: times.at(-1) ?? "",
      };
    }),
  };
}

/** One annotation as the agents service stores it. */
export function annotation(
  fields: Pick<Annotation, "trace_id" | "name" | "annotated_at" | "source"> &
    Partial<Omit<Annotation, "trace_id" | "name" | "annotated_at" | "source">>,
): Annotation {
  return {
    span_id: "",
    session_id: "",
    value: null,
    label: "",
    explanation: "",
    description: "",
    raw: "",
    attributes: {},
    ...fields,
  };
}

const target = (row: Annotation) =>
  [row.trace_id, row.span_id, row.session_id, row.name, row.source.kind, row.source.id].join(" ");

/** The newest annotation per target, name and source, oldest first. */
export function latestAnnotations(rows: readonly Annotation[]): Annotation[] {
  const latest = new Map<string, Annotation>();
  for (const row of rows.toSorted((left, right) =>
    left.annotated_at.localeCompare(right.annotated_at),
  )) {
    latest.delete(target(row));
    latest.set(target(row), row);
  }
  return [...latest.values()];
}

// one root span per turn until a trace's full spans load
export const indexedTraces = (rows: readonly IndexRow[], agent: string): Trace[] =>
  rows.map(
    ([
      trace_id,
      span_id,
      session_id,
      input,
      started_at,
      duration_ns,
      environment,
      version,
      input_tokens,
      output_tokens,
      trial,
    ]) => ({
      trace_id,
      spans: [
        {
          span_id,
          parent_span_id: "",
          name: `invoke_agent ${agent}`,
          kind: "Internal",
          service_name: agent,
          started_at,
          duration_ns,
          status_code: "Unset",
          status_message: "",
          attributes: {
            "gen_ai.input.messages": JSON.stringify([
              { role: "user", parts: [{ type: "text", content: input }] },
            ]),
            [CONVERSATION_ATTRIBUTE]: session_id,
            ...(input_tokens === null ? {} : { "gen_ai.usage.input_tokens": String(input_tokens) }),
            ...(output_tokens === null
              ? {}
              : { "gen_ai.usage.output_tokens": String(output_tokens) }),
            ...trial,
          },
          resource_attributes: {
            ...(version === null ? {} : { "service.version": version }),
            "deployment.environment.name": environment,
          },
          events: [],
        },
      ],
    }),
  );
