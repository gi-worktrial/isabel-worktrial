import { z } from "zod";
import { type Api, query } from "./api.ts";
import { type Evaluation, evaluationRecord, messageSchema } from "./genai.ts";
import { type SpanExport, spanRecord } from "./otlp.ts";

const attributesSchema = z.record(z.string(), z.string());

const agentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  repo: z.string(),
  created_by: z.uuid(),
  created_at: z.string(),
});

const apiKeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** The key's first characters, so a listing can tell keys apart. */
  prefix: z.string(),
  created_by: z.uuid(),
  created_at: z.string(),
});

const traceSummarySchema = z.object({
  trace_id: z.string(),
  /** The root span's name. */
  name: z.string(),
  service_name: z.string(),
  started_at: z.string(),
  duration_ns: z.number(),
  status_code: z.string(),
});

const spanSchema = traceSummarySchema.omit({ trace_id: true }).extend({
  span_id: z.string(),
  /** Empty for the trace's root. */
  parent_span_id: z.string(),
  kind: z.string(),
  status_message: z.string(),
  attributes: attributesSchema,
  resource_attributes: attributesSchema,
  events: z.array(
    z.object({ timestamp: z.string(), name: z.string(), attributes: attributesSchema }),
  ),
});

/** The distinct current labels on a listed trace or session (and its turns' traces), from every source. */
const rowAnnotationsSchema = z.array(z.object({ name: z.string(), label: z.string() }));

const sessionSummarySchema = z.object({
  /** The turns' `gen_ai.conversation.id`. */
  session_id: z.string(),
  started_at: z.string(),
  last_turn_at: z.string(),
  /** From the first turn's start to the last turn's end. */
  duration_ns: z.number(),
  turns: z.number(),
  /** Turns whose root span has an error status. */
  errors: z.number(),
  /** Summed over the turns that reported it (null when none did). */
  input_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  /** Input messages from the first turn that has any. */
  first_input: z.array(messageSchema),
  /** Output messages from the last turn that has any. */
  last_output: z.array(messageSchema),
  annotations: rowAnnotationsSchema,
});

/** One turn of a session, summarized from its root span. */
const turnSchema = z.object({
  trace_id: z.string(),
  /** 1 for the session's first turn. */
  position: z.number(),
  name: z.string(),
  started_at: z.string(),
  duration_ns: z.number(),
  status_code: z.string(),
  /** The root span's `error.type` (such as `interrupted`), empty when the turn succeeded. */
  error_type: z.string(),
  input_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  /** The distinct current labels on the turn's trace and its spans. */
  annotations: rowAnnotationsSchema,
  /** Every span of the turn's trace, in start order. */
  spans: z.array(spanSchema),
});

/** A `gen_ai.evaluation.result` event, the newest from its source for its target and name. */
const annotationSchema = z.object({
  /** Empty for an annotation on the whole session. */
  trace_id: z.string(),
  /** Empty for an annotation on the whole trace. */
  span_id: z.string(),
  /** The `gen_ai.conversation.id` the annotation named, empty when it named none. */
  session_id: z.string(),
  name: z.string(),
  /** Numbers, and 0 or 1 for booleans. */
  value: z.number().nullable(),
  /** Categories, and `pass` or `fail`. */
  label: z.string(),
  /** A comment or a judge's reasoning. */
  explanation: z.string(),
  /** What the criterion checks, empty when the writer gave none. */
  description: z.string(),
  /** The grader's score before it was normalized into `value`, as JSON, empty when the writer gave none. */
  raw: z.string(),
  /** Stamped from the writer's credentials (a user, an agent, or a job and the commit it ran). */
  source: z.object({ kind: z.enum(["human", "code", "llm"]), id: z.string(), commit: z.string() }),
  /** Every attribute of the record, such as `grounded.annotation.correction`. */
  attributes: attributesSchema,
  annotated_at: z.string(),
});

const agentsSchema = z.object({ agents: z.array(agentSchema) });
const apiKeysSchema = z.object({ keys: z.array(apiKeySchema) });
const createdKeySchema = apiKeySchema.extend({ key: z.string() });
const listedTraceSchema = traceSummarySchema.extend({
  /** The root span's `gen_ai.conversation.id`, empty when it has none. */
  session_id: z.string(),
  /** The Eval a trial ran (its root span's `grounded.task.name`), empty for other traces. */
  task_name: z.string(),
  /** The root span's input messages. */
  input: z.array(messageSchema),
  annotations: rowAnnotationsSchema,
});
const tracePageSchema = z.object({
  traces: z.array(listedTraceSchema),
  has_more: z.boolean(),
  /** How many traces match the filters. */
  total: z.number(),
});
const traceSchema = z.object({ trace_id: z.string(), spans: z.array(spanSchema) });
const sessionSchema = z.object({
  session: sessionSummarySchema,
  turns: z.array(turnSchema),
  has_more: z.boolean(),
});
const sessionPageSchema = z.object({
  sessions: z.array(sessionSummarySchema),
  has_more: z.boolean(),
  /** How many sessions match the filters. */
  total: z.number(),
});
const traceAnnotationsSchema = z.object({
  trace_id: z.string(),
  annotations: z.array(annotationSchema),
});
const sessionAnnotationsSchema = z.object({
  session_id: z.string(),
  annotations: z.array(annotationSchema),
});
const annotationCountsSchema = z.object({
  counts: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      traces: z.number(),
      first_seen_at: z.string(),
      last_seen_at: z.string(),
    }),
  ),
});

export type Agent = z.infer<typeof agentSchema>;
export type ApiKey = z.infer<typeof apiKeySchema>;
export type CreatedApiKey = z.infer<typeof createdKeySchema>;
export type TraceSummary = z.infer<typeof traceSummarySchema>;
export type ListedTrace = z.infer<typeof listedTraceSchema>;
export type TracePage = z.infer<typeof tracePageSchema>;
export type Span = z.infer<typeof spanSchema>;
export type Trace = z.infer<typeof traceSchema>;
export type Turn = z.infer<typeof turnSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionPage = z.infer<typeof sessionPageSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
export type TraceAnnotations = z.infer<typeof traceAnnotationsSchema>;
export type SessionAnnotations = z.infer<typeof sessionAnnotationsSchema>;
export type AnnotationCounts = z.infer<typeof annotationCountsSchema>;

type Filters = {
  /** `name:label` pairs, each of which a match currently has (on a trace, one of its spans, or a session). */
  annotation?: readonly string[] | undefined;
  /** `key:value` pairs, each of which one of a match's spans has. */
  attribute?: readonly string[] | undefined;
  /** Matches an ID prefix or the text of an input message, ignoring case. */
  q?: string | undefined;
  /** Whether matches are eval trials (their root span has `grounded.job_run.id`). */
  trial?: boolean | undefined;
  /** Trace IDs to keep, if any: a trace must be one, a session must contain one. */
  trace?: readonly string[] | undefined;
};

export type ListTracesOptions = Filters & {
  agent: string;
  limit?: number | undefined;
  /** The last trace ID of the previous page. */
  after?: string | undefined;
};

export type ListSessionsOptions = Filters & {
  agent: string;
  limit?: number | undefined;
  /** The last session ID of the previous page. */
  after?: string | undefined;
};

export type AnnotateOptions = {
  agent: string;
  evaluations: Evaluation[];
  kind?: "code" | "llm" | undefined;
};

export type ExportSpansOptions = { agent: string; spans: SpanExport[] };

export type GetSessionOptions = {
  agent: string;
  session: string;
  /** Turns per page (10 by default). */
  limit?: number | undefined;
  /** The last trace ID of the previous page. */
  after?: string | undefined;
};

/** An organization's agents, their API keys, and their traces, addressed by agent name. */
export class Agents {
  constructor(private readonly api: Api) {}

  async list(): Promise<Agent[]> {
    return (await this.api.json("/agents", agentsSchema)).agents;
  }

  /** Needs `agent:manage`, which admins hold. */
  create({ name }: { name: string }): Promise<Agent> {
    return this.api.json("/agents", agentSchema, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  get({ agent }: { agent: string }): Promise<Agent> {
    return this.api.json(agentPath(agent), agentSchema);
  }

  /** Deletes the agent and its keys (needs `agent:manage`). */
  async delete({ agent }: { agent: string }) {
    await this.api.request(agentPath(agent), { method: "DELETE" });
  }

  /** Needs `agent:manage`. */
  async listKeys({ agent }: { agent: string }): Promise<ApiKey[]> {
    return (await this.api.json(`${agentPath(agent)}/keys`, apiKeysSchema)).keys;
  }

  /** A new key, whose secret `key` this response is the only one to carry (needs `agent:manage`). */
  createKey({ agent, name }: { agent: string; name: string }): Promise<CreatedApiKey> {
    return this.api.json(`${agentPath(agent)}/keys`, createdKeySchema, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  /** Revokes a key by its ID (needs `agent:manage`). */
  async deleteKey({ agent, key }: { agent: string; key: string }) {
    await this.api.request(`${agentPath(agent)}/keys/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
  }

  /** The agent's traces by their root spans, newest first. */
  listTraces({
    agent,
    limit,
    after,
    annotation,
    attribute,
    q,
    trial,
    trace,
  }: ListTracesOptions): Promise<TracePage> {
    return this.api.json(
      `${agentPath(agent)}/traces${query({ limit, after, annotation, attribute, q, trial: trial?.toString(), trace })}`,
      tracePageSchema,
    );
  }

  /** The agent's sessions (traces grouped by `gen_ai.conversation.id`), most recently active first. */
  listSessions({
    agent,
    limit,
    after,
    annotation,
    attribute,
    q,
    trial,
    trace,
  }: ListSessionsOptions): Promise<SessionPage> {
    return this.api.json(
      `${agentPath(agent)}/sessions${query({ limit, after, annotation, attribute, q, trial: trial?.toString(), trace })}`,
      sessionPageSchema,
    );
  }

  /** A session's summary and a page of its turns in start order, each with its position, labels, and spans. */
  getSession({ agent, session, limit, after }: GetSessionOptions): Promise<Session> {
    return this.api.json(
      `${agentPath(agent)}/sessions/${encodeURIComponent(session)}${query({ limit, after })}`,
      sessionSchema,
    );
  }

  /** Every span of a trace, in start order. */
  getTrace({ agent, trace }: { agent: string; trace: string }): Promise<Trace> {
    return this.api.json(`${agentPath(agent)}/traces/${encodeURIComponent(trace)}`, traceSchema);
  }

  /** Records annotations as `gen_ai.evaluation.result` events, from the token's user or job. */
  async annotate({ agent, evaluations, kind }: AnnotateOptions) {
    const { id } = await this.get({ agent });
    const body = {
      resourceLogs: [{ scopeLogs: [{ logRecords: evaluations.map(evaluationRecord) }] }],
    };

    await this.api.request(`/agents/${id}/v1/logs`, {
      method: "POST",
      headers: kind ? { "Grounded-Annotation-Kind": kind } : {},
      body: JSON.stringify(body),
    });
  }

  /** Exports spans to the agent's traces (needs a delegated or job token with `trace:write`). */
  async exportSpans({ agent, spans }: ExportSpansOptions) {
    const { id } = await this.get({ agent });
    const body = { resourceSpans: [{ scopeSpans: [{ spans: spans.map(spanRecord) }] }] };

    await this.api.request(`/agents/${id}/v1/traces`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** The current annotations of a trace and its spans, oldest first. */
  listAnnotations({ agent, trace }: { agent: string; trace: string }): Promise<TraceAnnotations> {
    return this.api.json(
      `${agentPath(agent)}/traces/${encodeURIComponent(trace)}/annotations`,
      traceAnnotationsSchema,
    );
  }

  /** The current annotations of a session and of its turns' traces and spans, oldest first. */
  listSessionAnnotations({
    agent,
    session,
  }: {
    agent: string;
    session: string;
  }): Promise<SessionAnnotations> {
    return this.api.json(
      `${agentPath(agent)}/sessions/${encodeURIComponent(session)}/annotations`,
      sessionAnnotationsSchema,
    );
  }

  annotationCounts({ agent }: { agent: string }): Promise<AnnotationCounts> {
    return this.api.json(`${agentPath(agent)}/annotations/counts`, annotationCountsSchema);
  }
}

function agentPath(agent: string) {
  return `/agents/${encodeURIComponent(agent)}`;
}
