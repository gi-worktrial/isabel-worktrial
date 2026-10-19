// the seed's Traces and annotations as the OTLP/HTTP JSON bodies platform's collector takes on /v1/traces and
// /v1/logs, so one dataset loads into platform as it is and into the demo through these decoders, which read it
// back the way the collector, ClickHouse and the agents service do
import { z } from "zod";

import { type Evaluation, type EvaluationTarget, evaluationRecord } from "#src/sdk/genai";
import type { Trace } from "#src/sdk/index";
import { otlpAttributes } from "#src/sdk/otlp";

const AnyValueSchema = z.union([
  z.strictObject({ stringValue: z.string() }),
  z.strictObject({ intValue: z.string() }),
  z.strictObject({ doubleValue: z.number() }),
  z.strictObject({ boolValue: z.boolean() }),
]);
const KeyValuesSchema = z.array(z.strictObject({ key: z.string(), value: AnyValueSchema }));
const ScopeSchema = z.strictObject({ name: z.string(), version: z.string().optional() });
const ResourceSchema = z.strictObject({ attributes: KeyValuesSchema });

const OtlpSpanSchema = z.strictObject({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  kind: z.number().int(),
  startTimeUnixNano: z.string(),
  endTimeUnixNano: z.string(),
  attributes: KeyValuesSchema,
  status: z.strictObject({ code: z.number().int().optional(), message: z.string().optional() }),
  events: z
    .array(
      z.strictObject({ timeUnixNano: z.string(), name: z.string(), attributes: KeyValuesSchema }),
    )
    .optional(),
});

/** An ExportTraceServiceRequest, as the seed writes it. */
export const OtlpTracesSchema = z.strictObject({
  resourceSpans: z.array(
    z.strictObject({
      resource: ResourceSchema,
      scopeSpans: z.array(z.strictObject({ scope: ScopeSchema, spans: z.array(OtlpSpanSchema) })),
    }),
  ),
});
export type OtlpTraces = z.infer<typeof OtlpTracesSchema>;

const OtlpLogRecordSchema = z.strictObject({
  eventName: z.string(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  attributes: KeyValuesSchema,
});

/** An ExportLogsServiceRequest of `gen_ai.evaluation.result` records, as `evaluationRecord` builds them. */
export const OtlpLogsSchema = z.strictObject({
  resourceLogs: z.array(
    z.strictObject({
      resource: ResourceSchema,
      scopeLogs: z.array(
        z.strictObject({ scope: ScopeSchema, logRecords: z.array(OtlpLogRecordSchema) }),
      ),
    }),
  ),
});
export type OtlpLogs = z.infer<typeof OtlpLogsSchema>;

// OTLP's span kinds and status codes by number, in the words platform's read API uses
const KINDS = ["Unspecified", "Internal", "Server", "Client", "Producer", "Consumer"] as const;
const CODES = ["Unset", "Ok", "Error"] as const;
const SERVICE_NAME = "service.name";

/** An evaluation as the SDK's `evaluationRecord` takes it, which the seed's logs files hold. */
export const EvaluationSchema = z.strictObject({
  target: z.union([
    z.strictObject({ kind: z.literal("trace"), trace: z.string(), span: z.string().optional() }),
    z.strictObject({ kind: z.literal("session"), session: z.string() }),
  ]),
  name: z.string(),
  value: z.number().optional(),
  label: z.string().optional(),
  explanation: z.string().optional(),
  description: z.string().optional(),
  raw: z.string().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
}) satisfies z.ZodType<Evaluation>;

/** An ISO time with up to nanosecond digits as Unix nanoseconds. */
export function isoNanos(iso: string): bigint {
  const match = /^(.*?)(?:\.(\d+))?Z$/u.exec(iso);
  if (match === null) {
    throw new Error(`Not an ISO time: ${iso}`);
  }
  const seconds = BigInt(Date.parse(`${match[1]}Z`)) / 1000n;
  return seconds * 1_000_000_000n + BigInt((match[2] ?? "").padEnd(9, "0").slice(0, 9));
}

/** Unix nanoseconds as an ISO time with all nine digits, as platform's read API writes one. */
export function nanosIso(nanos: bigint): string {
  const seconds = nanos / 1_000_000_000n;
  const day = new Date(Number(seconds) * 1000).toISOString().slice(0, 19);
  return `${day}.${String(nanos % 1_000_000_000n).padStart(9, "0")}Z`;
}

const attributesOf = (values: z.infer<typeof KeyValuesSchema>) =>
  Object.fromEntries(
    values.map(({ key, value }) => [key, String(Object.values(value)[0] ?? "")] as const),
  );

const sortedKey = (attributes: Readonly<Record<string, string>>) =>
  JSON.stringify(Object.entries(attributes).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** Traces as one ExportTraceServiceRequest, their spans grouped by the resource they ran on. */
export function encodeTraces(
  traces: readonly Trace[],
  scope: z.infer<typeof ScopeSchema>,
): OtlpTraces {
  const groups = new Map<string, { resource: Record<string, string>; spans: unknown[] }>();
  for (const { trace_id, spans } of traces) {
    for (const span of spans) {
      const key = sortedKey(span.resource_attributes);
      const group = groups.get(key) ?? { resource: span.resource_attributes, spans: [] };
      groups.set(key, group);
      const start = isoNanos(span.started_at);
      group.spans.push({
        traceId: trace_id,
        spanId: span.span_id,
        ...(span.parent_span_id === "" ? {} : { parentSpanId: span.parent_span_id }),
        name: span.name,
        kind: Math.max(KINDS.indexOf(span.kind as (typeof KINDS)[number]), 0),
        startTimeUnixNano: String(start),
        endTimeUnixNano: String(start + BigInt(span.duration_ns)),
        attributes: otlpAttributes(span.attributes),
        status: {
          ...(span.status_code === "Unset"
            ? {}
            : { code: Math.max(CODES.indexOf(span.status_code as (typeof CODES)[number]), 0) }),
          ...(span.status_message === "" ? {} : { message: span.status_message }),
        },
        ...(span.events.length === 0
          ? {}
          : {
              events: span.events.map((event) => ({
                timeUnixNano: String(isoNanos(event.timestamp)),
                name: event.name,
                attributes: otlpAttributes(event.attributes),
              })),
            }),
      });
    }
  }
  return OtlpTracesSchema.parse({
    resourceSpans: [...groups.values()].map(({ resource, spans }) => ({
      resource: { attributes: otlpAttributes(resource) },
      scopeSpans: [{ scope, spans }],
    })),
  });
}

/** An ExportTraceServiceRequest's Traces in platform's read shape, each trace's spans in start order. */
export function decodeTraces(body: OtlpTraces): Trace[] {
  const traces = new Map<string, Array<{ start: bigint; span: Trace["spans"][number] }>>();
  for (const { resource, scopeSpans } of body.resourceSpans) {
    const resourceAttributes = attributesOf(resource.attributes);
    for (const { spans } of scopeSpans) {
      for (const span of spans) {
        const start = BigInt(span.startTimeUnixNano);
        const list = traces.get(span.traceId) ?? [];
        traces.set(span.traceId, list);
        list.push({
          start,
          span: {
            span_id: span.spanId,
            parent_span_id: span.parentSpanId ?? "",
            name: span.name,
            service_name: resourceAttributes[SERVICE_NAME] ?? "",
            started_at: nanosIso(start),
            duration_ns: Number(BigInt(span.endTimeUnixNano) - start),
            status_code: CODES[span.status.code ?? 0] ?? "Unset",
            kind: KINDS[span.kind] ?? "Unspecified",
            status_message: span.status.message ?? "",
            attributes: attributesOf(span.attributes),
            resource_attributes: resourceAttributes,
            events: (span.events ?? []).map((event) => ({
              timestamp: nanosIso(BigInt(event.timeUnixNano)),
              name: event.name,
              attributes: attributesOf(event.attributes),
            })),
          },
        });
      }
    }
  }
  return [...traces].map(([trace_id, spans]) => ({
    trace_id,
    spans: spans
      .toSorted((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
      .map(({ span }) => span),
  }));
}

/** Evaluations as one ExportLogsServiceRequest of the records `evaluationRecord` builds. */
export function encodeEvaluations(
  evaluations: readonly Evaluation[],
  scope: z.infer<typeof ScopeSchema>,
): OtlpLogs {
  return OtlpLogsSchema.parse(
    JSON.parse(
      JSON.stringify({
        resourceLogs: [
          {
            resource: { attributes: [] },
            scopeLogs: [{ scope, logRecords: evaluations.map(evaluationRecord) }],
          },
        ],
      }),
    ),
  );
}

const EVALUATION_KEYS = {
  name: "gen_ai.evaluation.name",
  value: "gen_ai.evaluation.score.value",
  label: "gen_ai.evaluation.score.label",
  explanation: "gen_ai.evaluation.explanation",
  description: "grounded.criterion.description",
  raw: "grounded.score.raw",
  session: "gen_ai.conversation.id",
} as const;

/** An ExportLogsServiceRequest's evaluations, each with what it targets, as the collector reads them. */
export function decodeEvaluations(body: OtlpLogs): Evaluation[] {
  return body.resourceLogs.flatMap(({ scopeLogs }) =>
    scopeLogs.flatMap(({ logRecords }) =>
      logRecords.flatMap((record) => {
        const values = attributesOf(record.attributes);
        const name = values[EVALUATION_KEYS.name];
        if (name === undefined) {
          return [];
        }
        const session = values[EVALUATION_KEYS.session];
        const target: EvaluationTarget =
          record.traceId === undefined
            ? { kind: "session", session: session ?? "" }
            : { kind: "trace", trace: record.traceId, span: record.spanId };
        const value = values[EVALUATION_KEYS.value];
        return [
          {
            target,
            name,
            value: value === undefined ? undefined : Number(value),
            label: values[EVALUATION_KEYS.label],
            explanation: values[EVALUATION_KEYS.explanation],
            description: values[EVALUATION_KEYS.description],
            raw: values[EVALUATION_KEYS.raw],
          },
        ];
      }),
    ),
  );
}
