import {
  type Annotation,
  type Message,
  type Span,
  getGradeCriterion,
  spanMessages,
} from "@grounded-intelligence/grounded-sdk";
import { useSuspenseQuery } from "@tanstack/react-query";
import { sessionQuery, traceQuery } from "#/queries";
import { Link, createFileRoute } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { z } from "zod";

import { crumbs } from "#/crumbs";
import { type Grade, GradeRow, TextStep, ToolCall, gradeKey } from "#/trace-view";
import { sessionTitle } from "#/titles";
import {
  KIND_ICONS,
  formatJson,
  spanError,
  spanKind,
  spanLabel,
  spanRows,
  toolLabel,
} from "#/traces";
import { cn } from "#/ui/cn";
import { Fact, Facts } from "#/ui/facts";
import { formatDuration } from "#src/features/traces/duration";
import { Markdown } from "#/ui/markdown";
import { Tag } from "#/ui/tag";
import { Timestamp } from "#/ui/timestamp";
import { crumbTitle, turnCrumb } from "#src/features/traces/crumbs";
import { SpanTurnHeader, spanFailures, spanNotes } from "#src/features/traces/span-page";
import { StepNotes } from "#src/features/traces/transcript";

const ICON_TONES = {
  agent: "bg-accent-tint text-accent-ink",
  model: "bg-purple-tint text-purple",
  tool: "bg-warning-tint text-warning-ink",
  span: "bg-fill text-muted",
} as const;

export const Route = createFileRoute("/$orgId/agents/$agent/traces/$session/$trace")({
  validateSearch: z.object({ span: z.string().optional() }),
  loader: async ({ context: { queryClient }, params }) => {
    const [{ page }] = await Promise.all([
      queryClient.ensureQueryData(sessionQuery({ ...params, after: undefined })),
      queryClient.ensureQueryData(traceQuery(params)),
    ]);
    const index = page.turns.findIndex(({ trace_id }) => trace_id === params.trace);
    const up = page.turns[index + 1];
    const down = page.turns[index - 1];
    const turnNeighbor = (turn: (typeof page.turns)[number]) => ({
      label: `Go to Turn ${turn.position}`,
      to: "/$orgId/agents/$agent/traces/$session/$trace" as const,
      params: { trace: turn.trace_id },
    });
    return crumbs(
      { label: "Traces", to: "/$orgId/agents/$agent/traces" },
      { label: crumbTitle(sessionTitle(page.session)), to: "/$orgId/agents/$agent/traces/$session" },
      {
        label: turnCrumb(page.turns, params.trace),
        to: "/$orgId/agents/$agent/traces/$session/$trace",
        neighbors: {
          ...(up === undefined ? {} : { up: turnNeighbor(up) }),
          ...(down === undefined ? {} : { down: turnNeighbor(down) }),
        },
      },
    );
  },
  component: TracePage,
});

function TracePage() {
  const { orgId, agent, trace } = Route.useParams();
  const search = Route.useSearch();
  const { spans, annotations } = useSuspenseQuery(traceQuery({ orgId, agent, trace })).data;
  const rows = spanRows(spans);
  const root = rows[0]?.span;
  const selected = spans.find(({ span_id }) => span_id === search.span) ?? root;
  const grades = annotations.flatMap((annotation) => {
    const criterion = getGradeCriterion(annotation);
    const span_id = annotation.span_id || (root?.span_id ?? "");
    return criterion === undefined ? [] : [{ ...annotation, span_id, criterion, step: undefined }];
  });
  const failed = spanFailures(annotations, spans);
  return (
    <article aria-label="Spans" className="@container flex min-h-0 flex-col gap-4">
      <SpanTurnHeader spans={spans} annotations={annotations} selected={selected} />
      <div className="grid min-h-0 gap-6 @3xl:grid-cols-[minmax(20rem,1fr)_minmax(0,2fr)]">
        <section aria-label="Trace tree" className="flex min-w-0 flex-col gap-2">
          <h2 className="type-heading-15 text-ink">Trace tree</h2>
          <ol aria-label="Span tree" className="flex min-w-0 flex-col gap-px">
            {rows.map(({ span, depth }, index) => {
              const kind = spanKind(span);
              const Icon = KIND_ICONS[kind];
            const isRoot = span === root;
              const isLast = index === rows.length - 1;
            return (
                <li key={span.span_id} className="min-w-0">
                <Link
                  from={Route.fullPath}
                  to="."
                  search={{ span: span.span_id }}
                  replace
                  aria-current={span === selected ? "true" : undefined}
                  className={cn(
                      "min-w-0 rounded-sm bg-surface text-ink hover:bg-fill aria-current:row-selected",
                      isRoot ? "block" : "grid h-10 grid-cols-[1rem_minmax(0,1fr)]",
                  )}
                >
                  {!isRoot && (
                    <span
                      aria-hidden="true"
                        className={cn(
                          "relative self-stretch after:absolute after:top-[-1px] after:right-0 after:bottom-1/2 after:left-1/2 after:rounded-bl-md after:border-b after:border-l after:border-divider-strong",
                          !isLast &&
                            "before:absolute before:top-1/2 before:bottom-[-1px] before:left-1/2 before:border-l before:border-divider-strong",
                        )}
                    />
                  )}
                  <span
                    style={{
                      paddingLeft: `${Math.max(depth - 1, 0) * 0.75 + (isRoot ? 0.25 : 0.5)}rem`,
                    }}
                    className="flex h-10 min-w-0 items-center gap-2 pr-2 type-label-13"
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-xs",
                        ICON_TONES[kind],
                      )}
                    >
                      <Icon aria-hidden="true" className="size-3.5" />
                    </span>
                    <span className="min-w-0 truncate">{spanLabel(span)}</span>
                    {failed.has(span.span_id) && (
                      <span
                        aria-label="Failed"
                        title="Failed"
                        className="size-2 shrink-0 rounded-full bg-danger"
                      />
                    )}
                    {spanError(span) !== undefined && <Tag tone="danger">Error</Tag>}
                    <span className="ml-auto shrink-0 type-meta-12 text-muted tabular-nums">
                      {formatDuration(span.duration_ns)}
                    </span>
                  </span>
                </Link>
              </li>
            );
            })}
          </ol>
        </section>
        {selected && (
          <SpanDetails
            key={selected.span_id}
            span={selected}
            grades={grades.filter(({ span_id }) => span_id === selected.span_id)}
            notes={spanNotes(annotations, selected, spans)}
          />
        )}
      </div>
    </article>
  );
}

/** Attributes the details already show as a conversation or a tool call. */
const SHOWN = new Set([
  "gen_ai.input.messages",
  "gen_ai.output.messages",
  "gen_ai.tool.call.arguments",
  "gen_ai.tool.call.result",
]);

function SpanDetails({
  span,
  grades,
  notes,
}: {
  span: Span;
  grades: Grade[];
  notes: Annotation[];
}) {
  const error = spanError(span);
  const messages = [
    ...spanMessages(span, "gen_ai.input.messages"),
    ...spanMessages(span, "gen_ai.output.messages"),
  ].filter(({ role }) => role !== "system");
  return (
    <section aria-label="Span details" className="@container flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3">
        <h1 className="flex items-center gap-2 type-heading-15 text-ink">
          <span className="min-w-0 truncate">{spanLabel(span)}</span>
          {error !== undefined && <Tag tone="danger">Error</Tag>}
        </h1>
        <Facts label="Span facts" className="gap-x-10">
          {span.name !== spanLabel(span) && (
            <Fact label="Name" orientation="vertical">
              {span.name}
            </Fact>
          )}
          <Fact label="Service" orientation="vertical">
            {span.service_name}
          </Fact>
          <Fact label="Time" orientation="vertical">
            <Timestamp at={span.started_at} />
          </Fact>
          <Fact label="Duration" orientation="vertical">
            {formatDuration(span.duration_ns)}
          </Fact>
        </Facts>
        {error !== undefined && (
          <p className="max-w-reading rounded-xs bg-danger-tint px-3 py-2 type-label-13 text-danger">
            {error}
          </p>
        )}
        <StepNotes step={span.span_id} name={spanLabel(span)} notes={notes} />
      </header>
      {grades.length > 0 && (
        <Section title="Grades">
          <ol className="flex flex-col">
            {grades.map((grade) => (
              <GradeRow key={gradeKey(grade)} grade={grade} />
            ))}
          </ol>
        </Section>
      )}
      {messages.length > 0 && (
        <Section title="Messages">
          <Conversation messages={messages} />
        </Section>
      )}
      {spanKind(span) === "tool" && (
        <Section title="Tool call">
          <ToolCall span={span} />
        </Section>
      )}
      <Attributes span={span} />
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="type-label-13 font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

const ROLES = new Map([
  ["user", "User"],
  ["assistant", "Agent"],
  ["system", "System"],
  ["tool", "Tool"],
]);
const ToolIcon = KIND_ICONS.tool;

function Conversation({ messages }: { messages: Message[] }) {
  return (
    <ol className="flex flex-col gap-3 rounded-md bg-subtle p-3">
      {messages.map((message, index) => {
        const calls = message.parts.filter((part) => part.type === "tool_call");
        if (calls.length > 0 && calls.length === message.parts.length) {
          return (
            <li key={index} className="flex items-center gap-2 px-1 py-1 type-label-13 text-muted">
              <ToolIcon aria-hidden="true" className="size-3.5 shrink-0" />
              Calls {calls.map((call) => toolLabel(call.name ?? "a tool")).join(", ")}
            </li>
          );
        }
        return (
          <li
            key={index}
            className={cn(
              "flex flex-col gap-1",
              message.role === "user" ? "items-end" : "items-start",
            )}
          >
            <div
              className={cn(
                "flex min-w-0 max-w-reading flex-col gap-1 rounded-md px-3 py-2",
                message.role === "user" ? "bg-accent-tint" : "bg-fill",
              )}
            >
              {message.parts.map((part, at) => {
                switch (part.type) {
                  case "text":
                    return <Markdown key={at} text={part.content ?? ""} />;
                  case "reasoning":
                    return <TextStep key={at} label="Reasoning" text={part.content ?? ""} />;
                  case "tool_call":
                    return (
                      <p key={at} className="type-label-13 text-muted">
                        Calls {toolLabel(part.name ?? "a tool")}
                      </p>
                    );
                  case "tool_call_response":
                    return (
                      <pre
                        key={at}
                        className="max-h-60 overflow-auto rounded-sm bg-fill px-3 py-2 type-mono-12 whitespace-pre-wrap wrap-anywhere text-ink"
                      >
                        {JSON.stringify(part.response, null, 2)}
                      </pre>
                    );
                  default:
                    return (
                      <p key={at} className="type-label-13 text-muted">
                        {part.type}
                      </p>
                    );
                }
              })}
            </div>
            <p className="type-meta-12 font-medium text-muted">
              {ROLES.get(message.role) ?? message.role}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/** Attributes grouped by namespace, then the resource and events, filtered by key or value. */
function Attributes({ span }: { span: Span }) {
  const namespaces = new Map<string, [string, string][]>();
  for (const [key, value] of Object.entries(span.attributes)) {
    if (!SHOWN.has(key)) {
      const group = key.includes(".") ? key.slice(0, key.indexOf(".")) : "other";
      namespaces.set(group, [...(namespaces.get(group) ?? []), [key, value]]);
    }
  }
  const groups: { group: string; at?: string; entries: [string, string][] }[] = [
    ...[...namespaces].map(([group, entries]) => ({ group, entries })),
    { group: "resource", entries: Object.entries(span.resource_attributes) },
    ...span.events.map((event) => ({
      group: `event ${event.name}`,
      at: event.timestamp,
      entries: Object.entries(event.attributes),
    })),
  ];
  return (
    <Section title="Attributes">
      {groups.map(({ group, at, entries }, index) => (
        <section key={index} aria-label={group} className="flex flex-col gap-1">
          <h3 className="flex gap-2 type-meta-12 font-medium text-muted">
            {group}
            {at !== undefined && <Timestamp at={at} />}
          </h3>
          {entries.length > 0 && (
            <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 rounded-sm bg-fill px-3 py-2 type-mono-12">
              {entries.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="truncate py-0.5 text-muted" title={key}>
                    {key}
                  </dt>
                  <dd className="py-0.5 whitespace-pre-wrap wrap-anywhere text-ink">
                    {formatJson(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
    </Section>
  );
}
