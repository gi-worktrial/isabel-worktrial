// a Traces row's peek: a chevron opens a row under it with where the session failed and how long it ran, so a list
// reads without leaving it; one opens at a time, and Right and Left open and close it from the focused row
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Children, type KeyboardEvent, type ReactNode } from "react";

import { sessionQuery } from "#/queries";
import { isPlainKey } from "#/shortcuts";
import { OutcomeTag } from "#/trace-view";
import { counted } from "#/traces";
import { IconButton, buttonVariants } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Skeleton } from "#/ui/skeleton";
import { formatDuration } from "#src/features/traces/duration";
import { FailureLine, failureOf } from "#src/features/traces/failure";
import type { SessionSummary } from "#src/sdk/agents";
import { AskPebble } from "#src/ui/ask-pebble";
import { ErrorView } from "#src/ui/error-view";

type Params = { orgId: string; agent: string };

/** Right opens the focused row's peek and Left closes it. */
export function onPeekKey(
  event: KeyboardEvent<HTMLElement>,
  onPeek: (session: string | undefined) => void,
) {
  const { target } = event;
  const row = target instanceof Element ? target.closest<HTMLElement>("tr[data-session]") : null;
  if (row === null || !isPlainKey(event.nativeEvent)) {
    return;
  }
  if (event.key === "ArrowRight") {
    onPeek(row.dataset["session"]);
  } else if (event.key === "ArrowLeft") {
    onPeek(undefined);
  }
}

/** A session's row with its peek chevron first, and its peek under it while open. */
export function PeekRow({
  params,
  session,
  peek,
  onPeek,
  children,
}: {
  params: Params;
  session: SessionSummary;
  peek: string | undefined;
  onPeek(session: string | undefined): void;
  children: ReactNode;
}) {
  const open = peek === session.session_id;
  return (
    <>
      <tr data-session={session.session_id} className="group/peek">
        <td className="w-0 pr-0 @max-lg:hidden">
          <IconButton
            label={open ? "Close peek" : "Peek"}
            size="small"
            aria-expanded={open}
            onClick={() => onPeek(open ? undefined : session.session_id)}
            className={cn(
              !open && "opacity-0 group-hover/peek:opacity-100 focus-visible:opacity-100",
            )}
          >
            <ChevronRight
              className={cn("size-3.5 motion-safe:transition-transform", open && "rotate-90")}
            />
          </IconButton>
        </td>
        {children}
      </tr>
      {open && (
        <tr>
          <td
            colSpan={Children.toArray(children).length + 1}
            className="h-auto py-2 whitespace-normal"
          >
            <TracePeek params={params} session={session} />
          </td>
        </tr>
      )}
    </>
  );
}

function TracePeek({ params, session }: { params: Params; session: SessionSummary }) {
  const loaded = useQuery(
    sessionQuery({ ...params, session: session.session_id, after: undefined }),
  );
  if (loaded.error) {
    return (
      <ErrorView
        title="This Trace could not load"
        error={loaded.error}
        onRetry={() => void loaded.refetch()}
      />
    );
  }
  if (loaded.data === undefined) {
    return (
      <div role="status" aria-label="Loading Trace" className="flex h-7 items-center pl-10">
        <Skeleton className="h-3 w-3/5" />
      </div>
    );
  }
  const { annotations, page } = loaded.data;
  const failure = failureOf(annotations, page.turns);
  return (
    <section aria-label="Peek" className="flex flex-col gap-1 pl-10">
      {failure !== undefined && <FailureLine failure={failure} turns={page.turns.length} />}
      <div className="flex min-h-7 items-center gap-4 type-label-13 text-muted tabular-nums">
        {failure === undefined && <OutcomeTag annotations={session.annotations} />}
        <span>{counted(session.turns, "turns")}</span>
        <span>{formatDuration(session.duration_ns)}</span>
        <span className="ml-auto flex items-center gap-1">
          {failure !== undefined && <AskPebble prompt={`Why did ${failure.place} fail? `} />}
          <Link
            to="/$orgId/agents/$agent/traces/$session"
            params={{ ...params, session: session.session_id }}
            search={failure === undefined ? {} : { step: failure.id }}
            className={buttonVariants({ variant: "quiet", size: "small" })}
          >
            Open Trace
          </Link>
        </span>
      </div>
    </section>
  );
}
