// the Inbox's route skeleton in its board's or list's shape; route skeletons load with the first page, so this file
// imports only ui/skeleton and the router
import { useSearch } from "@tanstack/react-router";

import { Skeleton } from "#/ui/skeleton";
import { FiltersSkeleton, PageSkeleton, TableSkeleton } from "#src/ui/skeleton";

const LANES = ["Detected", "Reviewing", "Resolved", "Dismissed"];
const CARDS = [3, 2, 1, 1];

// the view control and search over four lanes of cards, or over the Issue table when the list is open
export function InboxSkeleton() {
  const { view } = useSearch({ from: "/$orgId/agents/$agent/issues/" });

  return (
    <PageSkeleton title="Inbox" label="Loading Inbox" actions={<FiltersSkeleton control="w-28" />}>
      {view === "list" ? (
        <TableSkeleton columns={3} rows={6} />
      ) : (
        <div className="grid grid-cols-[repeat(4,minmax(176px,1fr))] items-start gap-4 overflow-x-auto">
          {LANES.map((lane, index) => (
            <div key={lane} className="flex min-w-0 flex-col">
              <span
                aria-hidden="true"
                className="flex h-9 items-center gap-2 type-label-13 font-semibold text-ink"
              >
                <Skeleton className="size-4 rounded-full" />
                {lane}
              </span>
              <div className="flex flex-col gap-2">
                {Array.from({ length: CARDS[index] ?? 1 }, (_, card) => (
                  <div key={card} className="flex flex-col gap-3 card p-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-5 w-20 rounded-xs" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                    <Skeleton className="h-3.5 w-11/12" />
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageSkeleton>
  );
}
