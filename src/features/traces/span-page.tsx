// what the Spans page adds to platform's: the turn it drills into named above the timeline and in the page path, and
// every failing annotation marked on its span, not only Grades
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";

import { sessionQuery } from "#/queries";
import { spanError } from "#/traces";
import { buttonVariants } from "#/ui/button";
import { cn } from "#/ui/cn";
import { flat } from "#/ui/format";
import { Tag } from "#/ui/tag";
import type { Annotation, Span } from "#src/sdk/agents";
import { FAIL_LABEL, getGradeCriterion } from "#src/sdk/evals";
import { messageText, spanMessages } from "#src/sdk/genai";

const SPANS = "/$orgId/agents/$agent/traces/$session/$trace";

const rootOf = (spans: readonly Span[]) => spans.find((span) => span.parent_span_id === "");

/** The span an annotation names, else the turn's root, which it grades whole. */
const annotatedSpan = (annotation: Annotation, spans: readonly Span[]) =>
  annotation.span_id || (rootOf(spans)?.span_id ?? "");

/** The spans to mark red: each failing annotation's span, and each span that errored. */
export const spanFailures = (annotations: readonly Annotation[], spans: readonly Span[]) =>
  new Set([
    ...annotations.flatMap((annotation) =>
      annotation.label === FAIL_LABEL ? [annotatedSpan(annotation, spans)] : [],
    ),
    ...spans.flatMap((span) => (spanError(span) === undefined ? [] : [span.span_id])),
  ]);

/** A span's annotations with reasoning that aren't Grades, which the Grades section already shows. */
export const spanNotes = (annotations: readonly Annotation[], span: Span, spans: readonly Span[]) =>
  annotations.filter(
    (annotation) =>
      annotation.explanation &&
      getGradeCriterion(annotation) === undefined &&
      annotatedSpan(annotation, spans) === span.span_id,
  );

/** The turn the page drills into: its number, its question, Failed when it failed, and the way back to its step. */
export function SpanTurnHeader({
  spans,
  annotations,
  selected,
}: {
  spans: readonly Span[];
  annotations: readonly Annotation[];
  selected: Span | undefined;
}) {
  const params = useParams({ from: SPANS });
  const { page } = useSuspenseQuery(sessionQuery({ ...params, after: undefined })).data;
  const turn = page.turns.find(({ trace_id }) => trace_id === params.trace);
  const root = rootOf(spans);
  const question = root ? flat(messageText(spanMessages(root, "gen_ai.input.messages"))) : "";
  const step = selected === undefined || selected === root ? params.trace : selected.span_id;
  return (
    <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
      <p title={question} className="min-w-0 truncate type-title-18 text-ink">
        {question}
      </p>
      <div className="flex h-7 items-center gap-2">
        {turn !== undefined && (
          <p className="type-label-13 text-muted tabular-nums">Turn {turn.position}</p>
        )}
        {annotations.some(({ label }) => label === FAIL_LABEL) && <Tag tone="danger">Failed</Tag>}
      </div>
      <Link
        to="/$orgId/agents/$agent/traces/$session"
        params={params}
        search={{ step }}
        className={cn(
          buttonVariants({ variant: "quiet", size: "small" }),
          "col-start-2 row-start-1",
        )}
      >
        Open in transcript
      </Link>
    </header>
  );
}
