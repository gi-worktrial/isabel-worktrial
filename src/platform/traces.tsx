import { type Span, spanChildren } from "@grounded-intelligence/grounded-sdk";
import { Bot, Dot, MessageSquare, Wrench } from "lucide-react";
import { z } from "zod";

import { cn } from "#/ui/cn";
import { flat } from "#/ui/format";
import { Tooltip } from "#/ui/tooltip";
import { formatDuration } from "#src/features/traces/duration";
import { modelName } from "#src/features/traces/model-role";

const NANOS_PER_SECOND = 1e9;

// Keeps an instant span's bar visible.
const MIN_BAR_PERCENT = 0.5;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 3,
});

export const formatCost = (dollars: number) => usd.format(dollars);

const KINDS = new Map<string, SpanKind>([
  ["invoke_agent", "agent"],
  ["chat", "model"],
  ["execute_tool", "tool"],
]);

export type SpanKind = "agent" | "model" | "tool" | "span";

export const KIND_ICONS = { agent: Bot, model: MessageSquare, tool: Wrench, span: Dot };

export const spanKind = (span: Span) =>
  KINDS.get(span.attributes["gen_ai.operation.name"] ?? "") ?? "span";

export const toolLabel = (name: string) => name.replace(/^mcp__.+?__/u, "");

export function spanLabel(span: Span) {
  const { attributes } = span;
  switch (spanKind(span)) {
    case "agent":
      return attributes["gen_ai.agent.name"] ?? span.name;
    case "model":
      return attributes["gen_ai.request.model"] ?? span.name;
    case "tool":
      return toolLabel(attributes["gen_ai.tool.name"] ?? span.name);
    case "span":
      return span.name;
  }
}

export function spanError(span: Span) {
  return span.status_code === "Error"
    ? span.status_message || (span.attributes["error.type"] ?? "Error")
    : undefined;
}

const jsonSchema = z.string().transform((text, context) => {
  try {
    return JSON.parse(text);
  } catch {
    context.addIssue({ code: "custom", message: "Not JSON" });
    return z.NEVER;
  }
});

/** JSON text indented, or the text itself when it isn't JSON. */
export function formatJson(text: string) {
  const json = jsonSchema.safeParse(text);
  return json.success ? JSON.stringify(json.data, null, 2) : text;
}

const flatFieldsSchema = jsonSchema.pipe(
  z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
);

/** A JSON object of plain values, like most tool inputs, or nothing for other text. */
export function flatFields(text: string) {
  const fields = flatFieldsSchema.safeParse(text);
  return fields.success && Object.keys(fields.data).length > 0 ? fields.data : undefined;
}

/** A tool call's first text argument on one line, or its whole input. */
export function inputPreview(span: Span) {
  const text = span.attributes["gen_ai.tool.call.arguments"] ?? "";
  const first = Object.values(flatFields(text) ?? {}).find(
    (value) => z.string().safeParse(value).success,
  );
  return flat(first === undefined ? text : String(first));
}

/** Spans in tree order with their depth below the root. */
export function spanRows(spans: Span[]) {
  const children = spanChildren(spans);
  const rows = (parent: string, depth: number): { span: Span; depth: number }[] =>
    (children.get(parent) ?? []).flatMap((span) => [
      { span, depth },
      ...rows(span.span_id, depth + 1),
    ]);
  return rows("", 0);
}

/** Where each span starts within its trace, in nanoseconds, and how long the trace runs. */
export function spanTiming(spans: readonly Span[]) {
  const start = Math.min(...spans.map((span) => seconds(span.started_at)));
  const offset = (span: Span) => (seconds(span.started_at) - start) * NANOS_PER_SECOND;
  const total = Math.max(...spans.map((span) => offset(span) + span.duration_ns), 1);
  return { offset, total };
}

const BLOCKS = { user: "bg-divider", model: "bg-divider-strong", tool: "bg-divider-strong" };

/** A trace's user message, then its model and tool calls in start order. */
function blocks(spans: readonly Span[]) {
  const root = spans.find((span) => span.parent_span_id === "");
  const calls = spans
    .flatMap((span) => {
      const kind = spanKind(span);
      return kind === "model" || kind === "tool" ? [{ span, kind }] : [];
    })
    .sort((a, b) => seconds(a.span.started_at) - seconds(b.span.started_at));
  return [...(root ? [{ span: root, kind: "user" as const }] : []), ...calls];
}

/** One row of blocks per trace, each as wide as it took, with failures in red. */
export function SpanTimeline({
  traces,
  failed,
  selected,
  onPick,
  orientation = "horizontal",
}: {
  traces: readonly Span[][];
  failed: ReadonlySet<string>;
  selected?: string | undefined;
  onPick(span: Span): void;
  orientation?: "horizontal" | "vertical";
}) {
  const vertical = orientation === "vertical";
  return (
    <div
      role="group"
      aria-label="Timeline"
      className={cn(
        "flex",
        vertical
          ? "w-1.5 flex-col self-stretch overflow-hidden rounded-full bg-fill"
          : "h-2 gap-1",
      )}
    >
      {traces.map((spans, index) => (
        <div
          key={index}
          style={{ flexGrow: Math.max(spanTiming(spans).total, 1) }}
          className={cn(
            "flex basis-0 overflow-hidden",
            vertical ? "min-h-0 flex-col gap-px" : "min-w-0 gap-px",
          )}
        >
          {blocks(spans)
            .filter(({ kind }) => !vertical || kind !== "user")
            .map(({ span, kind }) => {
            const failing = failed.has(span.span_id);
            const name =
              kind === "user"
                ? "User message"
                : kind === "model"
                  ? modelName(span, spans)
                  : spanLabel(span);
            const label = `${traces.length > 1 ? `Turn ${index + 1}: ` : ""}${name}${kind === "user" ? "" : `, ${formatDuration(span.duration_ns)}`}${failing ? ", failed" : ""}`;
            return (
              <Tooltip key={span.span_id} label={label}>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={label}
                  aria-current={span.span_id === selected ? "true" : undefined}
                  onClick={() => onPick(span)}
                  style={{ flexGrow: kind === "user" ? 0 : span.duration_ns }}
                  className={cn(
                    "basis-0 hover:brightness-90 focus-visible:outline-2 focus-visible:outline-ring",
                    vertical
                      ? "w-full aria-current:bg-ring"
                      : "rounded-xs aria-current:outline-2 aria-current:outline-offset-1 aria-current:outline-ring",
                    kind === "user"
                      ? vertical
                        ? "min-h-1.5"
                        : "min-w-1.5"
                      : failing || span.span_id === selected
                        ? vertical
                          ? "min-h-1"
                          : "min-w-1"
                        : vertical
                          ? "min-h-0"
                          : "min-w-0",
                    failing ? "bg-danger" : BLOCKS[kind],
                  )}
                />
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** A span's bar within its trace's duration, on a grey track, red when it failed. */
export function SpanBar({
  span,
  timing,
  failed,
}: {
  span: Span;
  timing: ReturnType<typeof spanTiming>;
  failed: boolean;
}) {
  return (
    <span aria-hidden="true" className="relative h-1.5 w-24 shrink-0 rounded-xs bg-fill">
      <span
        style={{
          left: `${(timing.offset(span) / timing.total) * 100}%`,
          width: `${Math.max((span.duration_ns / timing.total) * 100, MIN_BAR_PERCENT)}%`,
        }}
        className={cn(
          "absolute inset-y-0 min-w-0.5 rounded-xs",
          failed ? "bg-danger" : "bg-ring",
        )}
      />
    </span>
  );
}

const resultSchema = jsonSchema.pipe(z.record(z.string(), z.json()));
const failedItemSchema = z.union([
  z.looseObject({ error: z.json() }),
  z.looseObject({ status: z.enum(["failed", "error"]) }),
]);

const singular = (noun: string) => noun.replace(/ies$/u, "y").replace(/(?<=ch|sh|x|ss)es$|s$/u, "");
export const counted = (count: number, noun: string) =>
  `${count || "No"} ${count === 1 ? singular(noun) : noun}`.trim();
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** What a tool call returned in a word or two: Error, `2 of 5 failed`, `3 policies`, its status, or Done. */
export function toolResult(span: Span) {
  const result = resultSchema.safeParse(span.attributes["gen_ai.tool.call.result"] ?? "");
  const data = result.success ? result.data : {};
  if (
    spanError(span) !== undefined ||
    data.is_error === true ||
    (data.error !== undefined && data.error !== null)
  ) {
    return { text: "Error", failed: true };
  }
  const [key = "", list] =
    Object.entries(data).flatMap(([name, value]) => {
      const items = z.array(z.json()).safeParse(value);
      return items.success ? [[name, items.data] as const] : [];
    })[0] ?? [];
  if (list !== undefined) {
    const failed = list.filter((item) => failedItemSchema.safeParse(item).success).length;
    return failed > 0
      ? { text: `${failed} of ${list.length} failed`, failed: true }
      : { text: capitalized(counted(list.length, key.replaceAll("_", " "))), failed: false };
  }
  const status = z.string().safeParse(data.status);
  if (status.success) {
    return { text: capitalized(status.data), failed: false };
  }
  const count = z.number().safeParse(data.count ?? data.total);
  const noun = (
    /[A-Z]?[a-z]+$/u.exec(toolLabel(span.attributes["gen_ai.tool.name"] ?? span.name))?.[0] ?? ""
  ).toLowerCase();
  return { text: count.success ? capitalized(counted(count.data, noun)) : "Done", failed: false };
}

/** Seconds since the epoch, keeping the part below a millisecond that `Date` drops. */
function seconds(iso: string) {
  const [whole = "", fraction = ""] = iso.replace("Z", "").split(".");
  return Date.parse(`${whole}Z`) / 1000 + Number(`0.${fraction || "0"}`);
}
