// Automations' tabs', an Automation's and a run's route skeletons, in their layouts' shapes; route skeletons load with
// the first page, so this file imports only ui/skeleton
import { cn } from "#/ui/cn";
import { Skeleton } from "#/ui/skeleton";
import { ControlSkeleton, FactsSkeleton, TableSkeleton } from "#src/ui/skeleton";

// Overview's Automations table: name, schedule, last result, last run and Run now
export function AutomationsSkeleton() {
  return <TableSkeleton columns={5} rows={4} label="Loading Automations" />;
}

// Running's live runs: run, trigger, ref, progress and started
export function RunningSkeleton() {
  return <TableSkeleton columns={5} rows={3} label="Loading runs" />;
}

// All runs: run, trigger, ref, result, started and duration
export function RunsSkeleton() {
  return <TableSkeleton columns={6} rows={8} label="Loading runs" />;
}

// the Automation's title with its Run now, its facts, then its runs
export function JobSkeleton() {
  return (
    <div role="status" aria-label="Loading Automation" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex min-h-8 items-center gap-3">
          <Skeleton className="h-4 w-56 max-w-full" />
          <Skeleton className="h-5 w-28 rounded-xs" />
          <ControlSkeleton className="ml-auto w-24" />
        </div>
        <FactsSkeleton facts={3} />
      </div>
      <div className="flex flex-col gap-3">
        <span aria-hidden="true" className="type-heading-15 text-ink">
          Runs
        </span>
        <TableSkeleton columns={6} rows={6} />
      </div>
    </div>
  );
}

// the run's title and status, its facts, then its steps in one card
export function RunSkeleton() {
  return (
    <div role="status" aria-label="Loading run" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex h-6 items-center gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-20 rounded-xs" />
        </div>
        <FactsSkeleton />
      </div>
      <div className="flex flex-col gap-2">
        <span aria-hidden="true" className="type-heading-15 text-ink">
          Steps
        </span>
        <div className="flex flex-col divide-y divide-divider card">
          {["w-40", "w-56", "w-32", "w-48"].map((width) => (
            <div key={width} className="flex h-9 items-center gap-2 px-4">
              <Skeleton className="size-3.5" />
              <Skeleton className={cn("h-3", width)} />
              <Skeleton className="ml-auto h-3 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
