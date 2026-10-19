import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { candidatesQuery, evalsQuery, issuesQuery, issueTracesQuery } from "#/queries";
import { flat } from "#/ui/format";
import { traceLabel } from "#src/features/pebble/records";
import type { Mention } from "#src/pebble/wire";
import { traceSearchQuery } from "#src/queries/extra";
import { messageText } from "#src/sdk/genai";
import { Chip } from "#src/ui/chip";

export type { Mention } from "#src/pebble/wire";

export const MENTION_GROUPS = [
  { kind: "issue", label: "Issues", chip: "issue" },
  { kind: "trace", label: "Traces", chip: "traces" },
  { kind: "eval", label: "Evals", chip: "evals" },
  { kind: "candidate", label: "Candidates", chip: "candidates" },
] as const satisfies ReadonlyArray<{ kind: Mention["kind"]; label: string; chip: string }>;

const TRACE_LIMIT = 20;
const CHIP = Object.fromEntries(MENTION_GROUPS.map(({ kind, chip }) => [kind, chip])) as Record<
  Mention["kind"],
  (typeof MENTION_GROUPS)[number]["chip"]
>;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** The Agent's Issues and Evals, plus the Traces and Candidates of the Issue in view, once `wanted`. */
export function useMentions({
  orgId,
  agent = "",
  issue,
  wanted,
}: {
  orgId: string;
  agent: string | undefined;
  issue: string | undefined;
  wanted: boolean;
}): Mention[] {
  const enabled = wanted && agent !== "";
  const scope = { orgId, agent, issue: issue ?? "" };
  const issues = useQuery({ ...issuesQuery(scope), enabled });
  const evals = useQuery({ ...evalsQuery(scope), enabled });
  const candidates = useQuery({
    ...candidatesQuery(scope),
    enabled: enabled && issue !== undefined,
  });
  const recent = useQuery({
    ...traceSearchQuery({ orgId, agent, q: "" }),
    enabled: enabled && issue === undefined,
  });
  const issueTraces = useQuery({
    ...issueTracesQuery({ ...scope, after: undefined, limit: TRACE_LIMIT }),
    enabled: enabled && issue !== undefined,
  });
  const traces = issue === undefined ? recent : issueTraces;
  return [
    ...(issues.data ?? []).map(({ id, title }): Mention => ({
      kind: "issue",
      label: id,
      detail: title,
      ref: { record: "issue", issue: id },
    })),
    ...(traces.data?.traces ?? []).flatMap(({ trace_id, session_id, input }): Mention[] =>
      session_id === ""
        ? []
        : [
            {
              kind: "trace",
              label: traceLabel(trace_id),
              detail: flat(messageText(input)),
              ref: { record: "trace", session: session_id, trace: trace_id },
            },
          ],
    ),
    ...(evals.data ?? []).map(({ id, title }): Mention => ({
      kind: "eval",
      label: title,
      detail: id,
      ref: { record: "eval", eval: id },
    })),
    ...(issue === undefined ? [] : (candidates.data ?? [])).map(({ id, title }): Mention => ({
      kind: "candidate",
      label: title,
      detail: id,
      ref: { record: "candidate", issue: issue ?? "", candidate: id },
    })),
  ];
}

// the composer's overlay pads with a shadow so each glyph stays over the caret
const OVERLAY =
  "rounded-[3px] bg-link text-link-ink shadow-[0_0_0_1px_var(--color-link),-3px_0_0_1px_var(--color-link),3px_0_0_1px_var(--color-link)] [box-decoration-break:clone]";

/** A prompt's mentions as chips: a sent one is bracketed (`@[label]`), a typed one is a known label after @. */
export function MentionText({
  text,
  mentions,
  overlay = false,
  onOpen,
}: {
  text: string;
  mentions: readonly Mention[];
  overlay?: boolean;
  onOpen?: ((mention: Mention) => void) | undefined;
}) {
  const labels = [...new Set(mentions.map(({ label }) => label))]
    .filter((label) => label !== "")
    .toSorted((left, right) => right.length - left.length);
  const typed =
    !overlay || labels.length === 0
      ? ""
      : `|@(${labels.map(escapeRegExp).join("|")})(?=$|[\\s.,!?;:)])`;
  const parts: ReactNode[] = [];
  let from = 0;
  for (const match of text.matchAll(new RegExp(`@\\[([^\\]]+)\\]${typed}`, "giu"))) {
    const name = match[1] ?? match[2] ?? "";
    const mention = mentions.find(({ label }) => label.toLowerCase() === name.toLowerCase());
    parts.push(text.slice(from, match.index));
    parts.push(
      overlay ? (
        <span key={match.index} className={OVERLAY}>
          @{name}
        </span>
      ) : (
        <Chip
          key={match.index}
          {...(mention === undefined ? {} : { kind: CHIP[mention.kind] })}
          className="align-text-bottom"
          onClick={
            mention === undefined || onOpen === undefined ? undefined : () => onOpen(mention)
          }
        >
          {name}
        </Chip>
      ),
    );
    from = match.index + match[0].length;
  }
  parts.push(text.slice(from));
  return parts;
}

/** The prompt with each typed mention bracketed, so labels with spaces survive, and the records it names. */
export function resolveMentions(prompt: string, mentions: readonly Mention[]) {
  let resolved = prompt;
  const named: Mention[] = [];
  for (const mention of mentions.toSorted(
    (left, right) => right.label.length - left.label.length,
  )) {
    const typed = new RegExp(`(^|\\s)@${escapeRegExp(mention.label)}(?=$|[\\s.,!?;:)])`, "giu");
    resolved = resolved.replace(typed, `$1@[${mention.label}]`);
    if (resolved.includes(`@[${mention.label}]`)) {
      named.push(mention);
    }
  }
  return { text: resolved.trim(), mentions: named };
}
