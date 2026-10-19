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
import { type ReactNode, useState } from "react";
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
import { SearchField } from "#/ui/search-field";
import { Tag } from "#/ui/tag";
import { Timestamp } from "#/ui/timestamp";
import { crumbTitle, turnCrumb } from "#src/features/traces/crumbs";
import {
  SpanTurnHeader,
  spanFailures,
  spanNotes,
} from "#src/features/traces/span-page";
import { StepNotes } from "#src/features/traces/transcript";

export const Route = createFileRoute("/$orgId/agents/$agent/traces/$session/$trace")({
  validateSearch: z.object({ span: z.string().optional() }),
  loader: async ({ context: { queryClient }, params }) => {
    const [{ page }] = await Promise.all([
      queryClient.ensureQueryData(sessionQuery({ ...params, after: undefined })),
      queryClient.ensureQueryData(traceQuery(params)),
    ]);
    return crumbs(
      { label: "Traces", to: "/$orgId/agents/$agent/traces" },
      { label: crumbTitle(sessionTitle(page.session)), to: "/$orgId/agents/$agent/traces/$session" },
      {
        label: turnCrumb(page.turns, params.trace),
        to: "/$orgId/agents/$agent/traces/$session/$trace",
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
  const longestProcess = Math.max(...rows.slice(1).map(({ span }) => span.duration_ns), 1);
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
        <ol aria-label="Span timeline" className="flex min-w-0 flex-col gap-px">
          {rows.map(({ span, depth }) => {
            const Icon = KIND_ICONS[spanKind(span)];
            const failing = failed.has(span.span_id) || spanError(span) !== undefined;
            const isRoot = span === root;
            const rowStyle = isRoot
              ? undefined
              : { minHeight: `${Math.max((span.duration_ns / longestProcess) * 72, 28)}px` };
            return (
              <li key={span.span_id} style={rowStyle} className="min-w-0">
                <Link
                  from={Route.fullPath}
                  to="."
                  search={{ span: span.span_id }}
                  replace
                  aria-current={span === selected ? "true" : undefined}
                  className={cn(
                    "min-w-0 rounded-xs text-ink hover:bg-fill aria-current:row-selected",
                    isRoot ? "block" : "grid h-full grid-cols-[0.375rem_minmax(0,1fr)] gap-1",
                  )}
                >
                  {!isRoot && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "w-1.5 self-stretch rounded-xs",
                        failing
                          ? "bg-danger"
                          : span === selected
                            ? "bg-ring"
                            : "bg-divider-strong",
                      )}
                    />
                  )}
                  <span
                    style={{ paddingLeft: `${depth + 0.25}rem` }}
                    className="flex h-7 min-w-0 self-center items-center gap-2 pr-2 type-label-13"
                  >
                    <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 truncate">{spanLabel(span)}</span>
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
  ];
  return (
    <section aria-label="Span details" className="@container flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3">
        <h1 className="flex items-center gap-2 type-title-18 text-ink">
          <span className="min-w-0 truncate">{spanLabel(span)}</span>
          {error !== undefined && <Tag tone="danger">Error</Tag>}
        </h1>
        <Facts label="Span facts">
          {span.name !== spanLabel(span) && <Fact label="Name">{span.name}</Fact>}
          <Fact label="Service">{span.service_name}</Fact>
          <Fact label="Time">
            <Timestamp at={span.started_at} />
          </Fact>
          <Fact label="Duration">{formatDuration(span.duration_ns)}</Fact>
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

function Conversation({ messages }: { messages: Message[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((message, index) => (
        <li key={index} className="flex gap-4">
          <p className="w-16 shrink-0 pt-0.5 type-meta-12 font-medium text-muted">
            {ROLES.get(message.role) ?? message.role}
          </p>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
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
        </li>
      ))}
    </ol>
  );
}

/** Attributes grouped by namespace, then the resource and events, filtered by key or value. */
function Attributes({ span }: { span: Span }) {
  const [query, setQuery] = useState("");
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
  const needle = query.toLowerCase();
  const matching = groups.flatMap((group) => {
    if (group.group.toLowerCase().includes(needle)) {
      return [group];
    }
    const entries = group.entries.filter((entry) => entry.join(" ").toLowerCase().includes(needle));
    return entries.length > 0 ? [{ ...group, entries }] : [];
  });

  return (
    <Section title="Attributes">
      <SearchField
        label="Search attributes"
        placeholder="Search attributes"
        value={query}
        onChange={setQuery}
        className="max-w-80"
      />
      {matching.map(({ group, at, entries }, index) => (
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
