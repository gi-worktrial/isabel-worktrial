import type { SessionPage } from "@grounded-intelligence/grounded-sdk";
import { Link, useLocation } from "@tanstack/react-router";
import { SESSION_PAGE_SIZE } from "#/queries";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { isPlainKey } from "./shortcuts";
import { GradeTally, OutcomeTag, issuesOf, sessionTitle } from "./trace-view";
import { IssueLinks } from "./evals";
import { PageLink } from "#/ui/page-link";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import { PeekRow, onPeekKey } from "#src/features/traces/peek";
import { TimeTag } from "#src/ui/time-tag";

const compact = new Intl.NumberFormat("en", { notation: "compact" });

/** Total tokens like `94K` and their `93K in, 882 out` breakdown, or undefined when neither was reported. */
export function tokenCount(input: number | null, output: number | null) {
  if (input === null && output === null) {
    return undefined;
  }

  const count = (value: number | null) => (value === null ? "-" : compact.format(value));
  return {
    total: compact.format((input ?? 0) + (output ?? 0)),
    breakdown: `${count(input)} in, ${count(output)} out`,
  };
}

function TokenCount({ input, output }: { input: number | null; output: number | null }) {
  const tokens = tokenCount(input, output);
  if (tokens === undefined) {
    return null;
  }

  return (
    <Tooltip label={tokens.breakdown}>
      <span tabIndex={0}>{tokens.total}</span>
    </Tooltip>
  );
}

/** A page of sessions, where `afters` holds each earlier page's cursor, oldest first, and eval trials show their Grades in place of turns and Issues. */
export function SessionTable({
  orgId,
  agent,
  page,
  source,
  afters,
  empty,
}: {
  orgId: string;
  agent: string;
  page: SessionPage;
  source: "production" | "eval";
  afters: string[];
  empty: ReactNode;
}) {
  const next = page.has_more ? page.sessions.at(-1)?.session_id : undefined;
  const first = afters.length * SESSION_PAGE_SIZE + 1;
  const href = useLocation({ select: (location) => location.href });
  const list = { href, sessions: page.sessions.map(({ session_id }) => session_id) };
  const rows = useRef<HTMLTableSectionElement>(null);
  const [peek, setPeek] = useState<string>();
  const errors = page.sessions.some((session) => session.errors > 0);

  // ↓ from the page focuses the first row, and in the table ↑ and ↓ move between rows, which Enter opens.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowDown" && event.target === document.body && isPlainKey(event)) {
        event.preventDefault();
        rows.current?.querySelector<HTMLElement>(".row-action")?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="card overflow-clip">
        <table aria-label="Traces" className="record-table">
          <thead>
            <tr>
              <th aria-label="Peek" className="@max-lg:hidden" />
              <th className="w-full">First message</th>
              {source === "eval" ? (
                <th className="@max-lg:hidden">Grades</th>
              ) : (
                <th className="@max-lg:hidden">Turns</th>
              )}
              <th>Outcome</th>
              {source === "production" && <th className="@max-2xl:hidden">Issues</th>}
              <th className={errors ? "@max-lg:hidden" : "hidden"}>Errors</th>
              <th className="@max-2xl:hidden">Tokens</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody
            ref={rows}
            onKeyDown={(event) => {
              onPeekKey(event, setPeek);
              const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
              if (step === 0 || !isPlainKey(event.nativeEvent)) {
                return;
              }

              const links = [...event.currentTarget.querySelectorAll<HTMLElement>(".row-action")];
              const { target } = event;
              const row = links.findIndex(
                (link) => target instanceof Node && link.closest("tr")?.contains(target),
              );
              const next = links[row + step];
              if (next !== undefined) {
                event.preventDefault();
                next.focus();
              }
            }}
          >
            {page.sessions.map((session) => (
              <PeekRow
                key={session.session_id}
                params={{ orgId, agent }}
                session={session}
                peek={peek}
                onPeek={setPeek}
              >
                <td className="max-w-0 text-ink">
                  <Link
                    to="/$orgId/agents/$agent/traces/$session"
                    params={{ orgId, agent, session: session.session_id }}
                    state={{ list }}
                    className="row-action block truncate"
                    title={sessionTitle(session)}
                  >
                    {sessionTitle(session)}
                  </Link>
                </td>
                {source === "eval" ? (
                  <td className="@max-lg:hidden">
                    <GradeTally annotations={session.annotations} />
                  </td>
                ) : (
                  <td className="tabular-nums @max-lg:hidden">{session.turns}</td>
                )}
                <td>
                  <OutcomeTag annotations={session.annotations} />
                </td>
                {source === "production" && (
                  <td className="@max-2xl:hidden">
                    <span className="flex gap-1">
                      <IssueLinks orgId={orgId} agent={agent} issues={issuesOf(session.annotations)} />
                    </span>
                  </td>
                )}
                <td className={errors ? "@max-lg:hidden" : "hidden"}>
                  {session.errors > 0 && <Tag tone="danger">{session.errors}</Tag>}
                </td>
                <td className="whitespace-nowrap tabular-nums @max-2xl:hidden">
                  <Tag>
                    <TokenCount input={session.input_tokens} output={session.output_tokens} />
                  </Tag>
                </td>
                <td className="whitespace-nowrap tabular-nums">
                  <TimeTag at={session.last_turn_at} />
                </td>
              </PeekRow>
            ))}
          </tbody>
        </table>
        {page.sessions.length === 0 && empty}
      </div>
      {page.sessions.length > 0 && (
        <div className="flex items-center justify-end gap-2 type-meta-12 text-muted tabular-nums">
          {`${first} to ${first + page.sessions.length - 1} of ${page.total.toLocaleString()}`}
          <PageButtons afters={afters} next={next} />
        </div>
      )}
    </div>
  );
}

/** Previous and next page buttons, where `next` is the next page's cursor when there is one. */
export function PageButtons({ afters, next }: { afters: string[]; next: string | undefined }) {
  const page = (cursors: string[]) => ({ afters: cursors.length > 0 ? cursors : undefined });
  return (
    <>
      <PageLink
        label="Previous page"
        search={afters.length > 0 ? page(afters.slice(0, -1)) : undefined}
      >
        <ChevronLeft className="size-4" />
      </PageLink>
      <PageLink label="Next page" search={next === undefined ? undefined : page([...afters, next])}>
        <ChevronRight className="size-4" />
      </PageLink>
    </>
  );
}
