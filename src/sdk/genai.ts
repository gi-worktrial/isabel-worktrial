import { z } from "zod";
import type { Span } from "./agents.ts";
import { otlpAttributes } from "./otlp.ts";

/** A GenAI message part, such as `text` or `reasoning` with its `content`, or a `tool_call` with its `name`. */
const messagePartSchema = z.looseObject({
  type: z.string(),
  content: z.string().optional(),
  name: z.string().optional(),
});

/** A GenAI chat message (the shape of `gen_ai.input.messages` and `gen_ai.output.messages`). */
export const messageSchema = z.object({ role: z.string(), parts: z.array(messagePartSchema) });
export type Message = z.infer<typeof messageSchema>;

/** The messages in a span's `gen_ai.input.messages` or `gen_ai.output.messages` (empty when it has none or they don't parse). */
export function spanMessages(
  span: Span,
  key: "gen_ai.input.messages" | "gen_ai.output.messages",
): Message[] {
  const text = span.attributes[key];
  if (!text) {
    return [];
  }

  try {
    return z.array(messageSchema).catch([]).parse(JSON.parse(text));
  } catch {
    return [];
  }
}

/** The text parts of a message list, one per line (empty when the span recorded no content). */
export function messageText(messages: Message[]) {
  const texts: string[] = [];
  for (const part of messages.flatMap((message) => message.parts)) {
    if (part.type === "text" && part.content) {
      texts.push(part.content);
    }
  }

  return texts.join("\n");
}

/** Spans by parent span ID, with roots (and spans whose parent wasn't exported) under `""`. */
export function spanChildren(spans: Span[]) {
  const ids = new Set(spans.map((span) => span.span_id));
  const children = new Map<string, Span[]>();
  for (const span of spans) {
    const parent = ids.has(span.parent_span_id) ? span.parent_span_id : "";
    children.set(parent, [...(children.get(parent) ?? []), span]);
  }

  return children;
}

// The GenAI conventions' evaluation event, as @opentelemetry/semantic-conventions names it.
export const EVENT_GEN_AI_EVALUATION_RESULT = "gen_ai.evaluation.result";
export const ATTR_GEN_AI_CONVERSATION_ID = "gen_ai.conversation.id";
export const ATTR_GEN_AI_EVALUATION_NAME = "gen_ai.evaluation.name";
export const ATTR_GEN_AI_EVALUATION_SCORE_VALUE = "gen_ai.evaluation.score.value";
export const ATTR_GEN_AI_EVALUATION_SCORE_LABEL = "gen_ai.evaluation.score.label";
export const ATTR_GEN_AI_EVALUATION_EXPLANATION = "gen_ai.evaluation.explanation";
// What an evaluation scored and the grader's own score, beside the conventions' fields.
export const ATTR_GROUNDED_CRITERION_DESCRIPTION = "grounded.criterion.description";
export const ATTR_GROUNDED_SCORE_RAW = "grounded.score.raw";

/** What an annotation is on, a trace (or one of its spans) or a session. */
export type EvaluationTarget =
  | { kind: "trace"; trace: string; span?: string | undefined }
  | { kind: "session"; session: string };

/** A `gen_ai.evaluation.result` event, minus the source the collector stamps. */
export type Evaluation = {
  target: EvaluationTarget;
  name: string;
  /** Numbers, and 0 or 1 for booleans. */
  value?: number | undefined;
  /** Categories, and `pass` or `fail`. */
  label?: string | undefined;
  /** A comment or a judge's reasoning. */
  explanation?: string | undefined;
  /** What the criterion checks, so the evaluation reads without its definition. */
  description?: string | undefined;
  /** The grader's score before it was normalized into `value`, such as `true` or `4`, as JSON. */
  raw?: string | undefined;
  /** More attributes for the record, such as `grounded.annotation.correction`. */
  attributes?: Record<string, string> | undefined;
};

/** An evaluation as an OTLP log record, timestamped by the collector when it arrives. */
export function evaluationRecord({
  target,
  name,
  value,
  label,
  explanation,
  description,
  raw,
  attributes,
}: Evaluation) {
  const { traceId, spanId, sessionId } = recordTarget(target);

  return {
    eventName: EVENT_GEN_AI_EVALUATION_RESULT,
    traceId,
    spanId,
    attributes: otlpAttributes({
      ...attributes,
      [ATTR_GEN_AI_CONVERSATION_ID]: sessionId,
      [ATTR_GEN_AI_EVALUATION_NAME]: name,
      [ATTR_GEN_AI_EVALUATION_SCORE_VALUE]: value,
      [ATTR_GEN_AI_EVALUATION_SCORE_LABEL]: label,
      [ATTR_GEN_AI_EVALUATION_EXPLANATION]: explanation,
      [ATTR_GROUNDED_CRITERION_DESCRIPTION]: description,
      [ATTR_GROUNDED_SCORE_RAW]: raw,
    }),
  };
}

// A log record attribute's value, as evaluationRecord encodes one.
const logValueSchema = z.object({
  stringValue: z.string().optional(),
  intValue: z.union([z.string(), z.number()]).optional(),
  doubleValue: z.number().optional(),
});
const logRecordSchema = z.object({
  eventName: z.string().optional(),
  attributes: z.array(z.object({ key: z.string(), value: logValueSchema.optional() })).default([]),
});

/** An OTLP JSON logs body, with just the fields evaluations are read from. */
export const otlpLogsSchema = z.object({
  resourceLogs: z
    .array(
      z.object({
        scopeLogs: z
          .array(z.object({ logRecords: z.array(logRecordSchema).default([]) }))
          .default([]),
      }),
    )
    .default([]),
});

/**
 * The named evaluations in an OTLP logs body, as evaluationRecord writes them, each with its
 * record's 1-based position among all the body's records.
 */
export function evaluationsFromLogs({ resourceLogs }: z.output<typeof otlpLogsSchema>) {
  const evaluations = [];
  let record = 0;
  for (const { scopeLogs } of resourceLogs) {
    for (const { logRecords } of scopeLogs) {
      for (const { eventName, attributes } of logRecords) {
        record += 1;
        const values = new Map(attributes.map(({ key, value }) => [key, value]));
        const name = values.get(ATTR_GEN_AI_EVALUATION_NAME)?.stringValue;
        if (eventName === EVENT_GEN_AI_EVALUATION_RESULT && name !== undefined) {
          evaluations.push({
            record,
            name,
            value: numberValue(values.get(ATTR_GEN_AI_EVALUATION_SCORE_VALUE)),
            label: values.get(ATTR_GEN_AI_EVALUATION_SCORE_LABEL)?.stringValue,
            explanation: values.get(ATTR_GEN_AI_EVALUATION_EXPLANATION)?.stringValue,
            description: values.get(ATTR_GROUNDED_CRITERION_DESCRIPTION)?.stringValue,
            raw: values.get(ATTR_GROUNDED_SCORE_RAW)?.stringValue,
          });
        }
      }
    }
  }

  return evaluations;
}

function numberValue(value: z.output<typeof logValueSchema> | undefined) {
  const raw = value?.doubleValue ?? value?.intValue ?? value?.stringValue;
  return raw === undefined ? undefined : Number(raw);
}

function recordTarget(target: EvaluationTarget) {
  switch (target.kind) {
    case "trace":
      return { traceId: target.trace, spanId: target.span, sessionId: undefined };
    case "session":
      return { traceId: undefined, spanId: undefined, sessionId: target.session };
  }
}
