// the Traces list's, a Trace's and its Spans' route skeletons, in their layouts' shapes; route skeletons load with the
// first page, so this file imports only ui/skeleton
import { cn } from "#/ui/cn";
import { Skeleton } from "#/ui/skeleton";
import {
  ControlSkeleton,
  FactsSkeleton,
  FiltersSkeleton,
  LinesSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "#src/ui/skeleton";

const TIMELINE = ["w-1/4", "w-1/6", "w-1/5", "w-1/3"];
const SPAN_ROWS = [
  { indent: "pl-2", name: "w-32" },
  { indent: "pl-8", name: "w-28" },
  { indent: "pl-8", name: "w-36" },
  { indent: "pl-14", name: "w-24" },
  { indent: "pl-8", name: "w-32" },
  { indent: "pl-8", name: "w-20" },
];

// the source control and search, the Annotations card beside the Traces table
export function TracesSkeleton() {
  return (
    <PageSkeleton
      title="Traces"
      label="Loading Traces"
      actions={<FiltersSkeleton control="w-40" />}
    >
      <div className="flex items-start gap-4">
        <div className="flex w-48 shrink-0 flex-col overflow-clip card">
          <div className="flex h-9 items-center border-b border-divider px-3">
            <Skeleton className="h-3 w-20" />
          </div>
          <LinesSkeleton lines={4} className="p-3" />
        </div>
        <div className="min-w-0 flex-1">
          <TableSkeleton columns={6} rows={8} />
        </div>
      </div>
    </PageSkeleton>
  );
}

// the Trace's title and facts, the view control, the timeline, then the first turn open (the user's message, the
// Agent's work and its answer) over the closed turns' header rows
export function TraceSkeleton() {
  return (
    <div role="status" aria-label="Loading Trace" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex h-6 items-center">
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <FactsSkeleton facts={5} />
      </div>
      <div className="flex min-h-8 items-center">
        <ControlSkeleton className="w-28" />
      </div>
      <div className="flex gap-1 border-b border-divider py-3">
        {TIMELINE.map((bar) => (
          <Skeleton key={bar} className={cn("h-2 rounded-xs", bar)} />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <TurnHeaderSkeleton />
        <div className="flex flex-col gap-2 pl-6">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-40" />
          <LinesSkeleton lines={2} className="max-w-reading" />
        </div>
        {[0, 1, 2].map((turn) => (
          <TurnHeaderSkeleton key={turn} />
        ))}
      </div>
    </div>
  );
}

function TurnHeaderSkeleton() {
  return (
    <div className="flex h-7 items-center gap-3">
      <Skeleton className="h-3.5 w-14" />
      <Skeleton className="h-3 w-48" />
      <Skeleton className="ml-auto h-3 w-12" />
    </div>
  );
}

// the timeline, then the span tree beside the selected span's details
export function SpansSkeleton() {
  return (
    <div role="status" aria-label="Loading Spans" className="flex flex-col gap-4">
      <div className="flex gap-1">
        {TIMELINE.map((bar) => (
          <Skeleton key={bar} className={cn("h-2 rounded-xs", bar)} />
        ))}
      </div>
      <div className="grid grid-cols-[minmax(20rem,1fr)_minmax(0,2fr)] gap-6">
        <div className="flex flex-col">
          {SPAN_ROWS.map((row) => (
            <div
              key={`${row.indent}:${row.name}`}
              className={cn("flex h-7 items-center justify-between gap-3 pr-2", row.indent)}
            >
              <Skeleton className={cn("h-3", row.name)} />
              <Skeleton className="h-1.5 w-24" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-4 w-40" />
          <FactsSkeleton facts={4} />
          <LinesSkeleton lines={3} />
        </div>
      </div>
    </div>
  );
}
