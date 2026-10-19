import { z } from "zod";

import { RUN_ATTRIBUTE, TASK_ATTRIBUTE, TRIAL_ATTRIBUTE } from "#src/demo/plane/traces";
import type { Trace } from "#src/sdk/index";

const AttributesSchema = z.record(z.string(), z.string());
const SpanSchema = z.strictObject({
  span_id: z.string(),
  parent_span_id: z.string(),
  name: z.string(),
  service_name: z.string(),
  started_at: z.string(),
  duration_ns: z.number(),
  status_code: z.string(),
  kind: z.string(),
  status_message: z.string(),
  attributes: AttributesSchema,
  resource_attributes: AttributesSchema,
  events: z.array(
    z.strictObject({ timestamp: z.string(), name: z.string(), attributes: AttributesSchema }),
  ),
});

// native SDK schemas are private, so this disk boundary is checked against the public Trace type
const TraceSchema = z.strictObject({
  trace_id: z.string(),
  spans: z.array(SpanSchema),
}) satisfies z.ZodType<Trace>;
export const NativeTracesSchema = z.array(TraceSchema);
const TemplateAttributesSchema = z.strictObject({ [TASK_ATTRIBUTE]: z.string() });
export const TrialAttributesSchema = z.union([
  TemplateAttributesSchema,
  z.strictObject({
    [RUN_ATTRIBUTE]: z.string(),
    [TRIAL_ATTRIBUTE]: z.string(),
    [TASK_ATTRIBUTE]: z.string(),
  }),
]);
const RootFields = [
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.number(),
  z.string(),
  z.string().nullable(),
  // the turn's input and output tokens, as the root's gen_ai.usage attributes give them
  z.number().nullable(),
  z.number().nullable(),
] as const;
/** A list turn's root span, followed by its trial attributes when present. */
const IndexRowSchema = z.union([
  z.tuple(RootFields),
  z.tuple([...RootFields, TrialAttributesSchema]),
]);
export const TraceIndexSchema = z.array(IndexRowSchema);
export type IndexRow = z.infer<typeof IndexRowSchema>;
