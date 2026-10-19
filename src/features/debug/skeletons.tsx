// Debug's route skeletons in the page's shape, which load with the first page, so this file imports only ui/skeleton
// and the router
import { useSearch } from "@tanstack/react-router";

import { Skeleton } from "#/ui/skeleton";
import { LinesSkeleton, TableSkeleton, TabsSkeleton } from "#src/ui/skeleton";

const VIEWS = ["Files", "Grades", "Traces"];

// the Debugging band, then the title, branch switcher and actions, Debug's views, then the open view, which is the
// editor with its file rail and tab bar for Files, the Grades list in a card, or the Traces table
function DebugSkeleton({ title }: { title?: string }) {
  const { view } = useSearch({ strict: false });

  return (
    <div
      role="status"
      aria-label="Loading Debug"
      className="flex h-[calc(100dvh-6rem)] flex-col gap-3"
    >
      <div className="-mx-3 flex h-10 shrink-0 items-center gap-3 rounded-sm bg-accent-tint px-3">
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-2">
          {title === undefined ? (
            <Skeleton className="h-4 w-64 max-w-full" />
          ) : (
            <span aria-hidden="true" className="truncate type-heading-15 text-ink">
              {title}
            </span>
          )}
          <Skeleton className="h-6 w-20 rounded-xs" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-xs" />
          <Skeleton className="h-7 w-24 rounded-xs" />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <TabsSkeleton tabs={VIEWS} className="shrink-0" />
        {view === undefined ? (
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden card">
            <div className="flex w-60 shrink-0 flex-col border-r border-divider">
              <div className="flex h-10 shrink-0 items-center border-b border-divider px-2">
                <Skeleton className="h-3 w-10" />
              </div>
              <LinesSkeleton lines={6} className="p-3" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-10 shrink-0 items-center border-b border-divider px-3">
                <Skeleton className="h-3 w-32" />
              </div>
              <LinesSkeleton lines={8} className="p-3" />
            </div>
          </div>
        ) : view === "grades" ? (
          <div className="min-h-0 flex-1 overflow-auto card">
            <GradesSkeleton />
          </div>
        ) : (
          <TableSkeleton columns={3} rows={5} />
        )}
      </div>
    </div>
  );
}

const GRADE_ROWS = ["h-3 w-2/5", "h-3 w-1/3", "h-3 w-1/2"];

/** The Grades list's rows, a mark and an Eval's title each. */
export function GradesSkeleton() {
  return (
    <div role="status" aria-label="Loading Grades" className="flex flex-col py-1">
      {GRADE_ROWS.map((title) => (
        <div key={title} className="flex h-9 items-center gap-2 px-3">
          <Skeleton className="size-4 rounded-xs" />
          <Skeleton className={title} />
        </div>
      ))}
    </div>
  );
}

export function DebugEvalsSkeleton() {
  return <DebugSkeleton title="Evals" />;
}

export function DebugCandidateSkeleton() {
  return <DebugSkeleton />;
}
