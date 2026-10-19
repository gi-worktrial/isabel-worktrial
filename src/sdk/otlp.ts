// OTLP/JSON encoding on zod/mini, so the tracing plugin's hook bundle stays small.
import * as z from "zod/mini";

/** An OTLP attribute's value, sent as a string, bool, int, double, or string array value. */
export type AttributeValue = string | number | boolean | string[];

/** A span to export, such as one a tool recorded after the fact. */
export type SpanExport = {
  trace: string;
  span: string;
  parent?: string | undefined;
  name: string;
  /** `internal` (OTLP's default) or `client`, for a call to a remote service such as a model. */
  kind?: "internal" | "client" | undefined;
  start: Date;
  end: Date;
  attributes?: Record<string, AttributeValue | undefined> | undefined;
  /** Marks the span failed with this message. */
  error?: string | undefined;
};

const SPAN_KINDS = { internal: 1, client: 3 } as const;

/** A span as an OTLP span. */
export function spanRecord({
  trace,
  span,
  parent,
  name,
  kind,
  start,
  end,
  attributes = {},
  error,
}: SpanExport) {
  return {
    traceId: trace,
    spanId: span,
    parentSpanId: parent,
    name,
    kind: kind && SPAN_KINDS[kind],
    startTimeUnixNano: unixNano(start),
    endTimeUnixNano: unixNano(end),
    attributes: otlpAttributes(attributes),
    status: error === undefined ? {} : { code: 2, message: error },
  };
}

/** Attributes as OTLP key-values, leaving out undefined values. */
export function otlpAttributes(values: Record<string, AttributeValue | undefined>) {
  return Object.entries(values).flatMap(([key, value]) =>
    value === undefined ? [] : [{ key, value: anyValueSchema.parse(value) }],
  );
}

const anyValueSchema = z.union([
  z.pipe(
    z.string(),
    z.transform((stringValue) => ({ stringValue })),
  ),
  z.pipe(
    z.boolean(),
    z.transform((boolValue) => ({ boolValue })),
  ),
  z.pipe(
    z.int(),
    z.transform((intValue) => ({ intValue: String(intValue) })),
  ),
  z.pipe(
    z.number(),
    z.transform((doubleValue) => ({ doubleValue })),
  ),
  z.pipe(
    z.array(z.string()),
    z.transform((values) => ({
      arrayValue: { values: values.map((stringValue) => ({ stringValue })) },
    })),
  ),
]);

function unixNano(date: Date) {
  return (BigInt(date.getTime()) * 1_000_000n).toString();
}
