// what the transcript adds to platform's trace view, for Steps and Flow alike: the session its span links open,
// citation chips that open their source, Expand all and the turns open at first, each step's place in words, and the
// notes under a step
import { useParams } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Minus, X } from "lucide-react";
import { createContext, use } from "react";
import { z } from "zod";

import { Button } from "#/ui/button";
import { cn } from "#/ui/cn";
import type { Annotation, Span, Turn } from "#src/sdk/agents";
import { FAIL_LABEL, PASS_LABEL, getGradeCriterion } from "#src/sdk/evals";
import { getMatchedIssue } from "#src/sdk/issues";
import { AskPebble } from "#src/ui/ask-pebble";

type SessionParams = { orgId: string; agent: string; session: string };

/** The session a transcript shown off its own page (a debug Eval's trial) links its spans in. */
export const TrialSession = createContext<SessionParams | undefined>(undefined);

/** The session page's params, else the trial's a `TrialSession` names. */
export function useSessionParams() {
  const page = useParams({ from: "/$orgId/agents/$agent/traces/$session/", shouldThrow: false });
  const trial = use(TrialSession);
  const params = page ?? trial;
  if (params === undefined) {
    throw new Error("A transcript off the session page needs its TrialSession");
  }
  return params;
}

// a document search's result, whose quotes a reply cites by their ids
const quotesSchema = z.object({
  quotes: z.array(z.object({ citation_id: z.string(), text: z.string() })),
});

/** Each quote a turn's tool calls returned by its citation id, with the call that returned it. */
function citedQuotes(spans: readonly Span[]) {
  return new Map(
    spans.flatMap((span) => {
      const result = span.attributes["gen_ai.tool.call.result"];
      let parsed: unknown;
      try {
        parsed = JSON.parse(result ?? "");
      } catch {
        return [];
      }
      const quotes = quotesSchema.safeParse(parsed);
      return quotes.success
        ? quotes.data.quotes.map(
            ({ citation_id, text }) => [citation_id, { step: span.span_id, quote: text }] as const,
          )
        : [];
    }),
  );
}

/** `CitationSources`' value for a session: a citation's quote, and its tool call picked in the transcript. */
export function citationSources(turns: readonly Turn[], pick: (id: string) => void) {
  const quotes = citedQuotes(turns.flatMap(({ spans }) => spans));
  return (id: string) => {
    const source = quotes.get(id);
    return source && { quote: source.quote, open: () => pick(source.step) };
  };
}

/** Opens every turn, or closes them all once they are. */
export function ExpandAll({
  turns,
  opened,
  onOpen,
}: {
  turns: readonly Turn[];
  opened: ReadonlySet<string>;
  onOpen(opened: Set<string>): void;
}) {
  const all = turns.every(({ trace_id }) => opened.has(trace_id));
  return turns.length > 1 ? (
    <Button
      variant="quiet"
      size="small"
      onClick={() => onOpen(new Set(all ? [] : turns.map(({ trace_id }) => trace_id)))}
      className="-my-2"
    >
      <ChevronsUpDown aria-hidden="true" className="size-3.5" />
      {all ? "Collapse all" : "Expand all"}
    </Button>
  ) : null;
}

/** The turns open first: Turn 1, the first failing turn, and the turn holding the step a link names. */
export function openAt(turns: readonly Turn[], step: string | undefined) {
  const failing = turns.find((turn) => turn.annotations.some(({ label }) => label === FAIL_LABEL));
  return new Set(
    turns.flatMap((turn, index) =>
      index === 0 ||
      turn === failing ||
      turn.trace_id === step ||
      turn.spans.some(({ span_id }) => span_id === step)
        ? [turn.trace_id]
        : [],
    ),
  );
}

/** A step's place in words ("RunEditorCommand in Turn 5"); `StepPlacesOf` provides it for a session's turns. */
export const StepPlaces = createContext<(step: string) => string | undefined>(() => undefined);

/** A Grade's jump named by where it lands, or "Go to step" off a session. */
export function StepPlace({ step }: { step: string }) {
  return use(StepPlaces)(step) ?? "Go to step";
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** An annotation's title: a Grade by its description, an Issue by its ID, else its name in sentence case. */
function noteTitle(annotation: Annotation) {
  const issue = getMatchedIssue(annotation);
  return (
    annotation.description ||
    getGradeCriterion(annotation) ||
    (issue === undefined ? sentence(annotation.name) : `Issue ${issue}`)
  );
}

const MARKS = new Map([
  [PASS_LABEL, { Mark: Check, tone: "text-muted" }],
  [FAIL_LABEL, { Mark: X, tone: "text-danger" }],
]);
const SCORED = { Mark: Minus, tone: "text-muted" };

/** A step's notes on one quiet panel, each with its mark, title and reasoning, and Ask Pebble when one fails. */
export function StepNotes({
  step,
  name,
  notes,
}: {
  step: string;
  /** The step's name where no session names its place, as on the Spans page. */
  name?: string;
  notes: readonly Annotation[] | undefined;
}) {
  const place = use(StepPlaces)(step) ?? name;
  if (notes === undefined || notes.length === 0) {
    return null;
  }
  return (
    <div className="my-1 flex max-w-reading items-start gap-2 rounded-sm bg-fill px-3 py-2 type-label-13">
      <ol className="flex min-w-0 flex-1 flex-col gap-2">
        {notes.map((annotation) => {
          const { Mark, tone } = MARKS.get(annotation.label) ?? SCORED;
          return (
            <li
              key={`${annotation.annotated_at}:${annotation.name}:${annotation.source.id}`}
              className="flex min-w-0 gap-2"
            >
              <span className="flex h-5 shrink-0 items-center">
                <Mark aria-hidden="true" strokeWidth={2.5} className={cn("size-4", tone)} />
              </span>
              <div className="flex min-w-0 flex-col">
                <p className="font-medium text-ink">{noteTitle(annotation)}</p>
                <p className="text-muted">{annotation.explanation}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {notes.some(({ label }) => label === FAIL_LABEL) && (
        <AskPebble
          prompt={`Why did ${place ?? "this step"} fail? `}
          className="-my-1 -mr-2 shrink-0"
        />
      )}
    </div>
  );
}
