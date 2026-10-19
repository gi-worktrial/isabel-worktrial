// the Issue page's and its tabs' route skeletons, in their layouts' shapes; route skeletons load with the first page, so
// this file imports only ui/skeleton and ui/tab-actions
import { Skeleton } from "#/ui/skeleton";
import { ControlSkeleton, LinesSkeleton, PageSkeleton, TableSkeleton } from "#src/ui/skeleton";
import { TabActions } from "#src/ui/tab-actions";

const ISSUE_TABS = ["Overview", "Candidates", "Evals", "Traces", "Activity"];
const EVENT_WIDTHS = ["h-3 w-1/2", "h-3 w-2/5", "h-3 w-3/5"];

const STEPS = ["Review", "Deploy"];

/** The Issue's two steps, unmarked, as platform's IssueSteps draws them. */
function StepsSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-2">
      {STEPS.map((step) => (
        <span key={step} className="flex flex-col gap-2 type-copy-14 text-faint">
          <span className="h-1 rounded-full bg-divider" />
          <span className="flex h-6 items-center gap-2">
            <span className="size-4 rounded-full border border-dashed border-divider-strong" />
            {step}
          </span>
        </span>
      ))}
    </div>
  );
}

const GLANCE_CARDS = ["Candidates", "Evals", "Traces"];

// the steps, the title row with its action, the facts line, the tab row, then the overview's prose and its cards
export function IssueSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <StepsSkeleton />
      <PageSkeleton
        label="Loading Issue"
        actions={<ControlSkeleton className="w-32" />}
        meta
        tabs={ISSUE_TABS}
      >
        <div className="flex flex-col gap-8">
          <LinesSkeleton lines={4} className="max-w-reading" />
          <div className="grid grid-cols-3 gap-4">
            {GLANCE_CARDS.map((card) => (
              <Skeleton key={card} className="h-[126px] rounded-sm" />
            ))}
          </div>
        </div>
      </PageSkeleton>
    </div>
  );
}

// the Traces tab's table: message, outcome, Issues and time
export function IssueTracesSkeleton() {
  return <TableSkeleton columns={4} label="Loading Traces" />;
}

// Debug Evals at the tab row's end over the Evals table
export function IssueEvalsSkeleton() {
  return (
    <>
      <TabActions>
        <ControlSkeleton className="w-24" />
      </TabActions>
      <TableSkeleton columns={3} rows={4} label="Loading Evals" />
    </>
  );
}

// Compare and New Candidate at the tab row's end over the Candidates table
export function CandidatesSkeleton() {
  return (
    <>
      <TabActions>
        <ControlSkeleton className="w-20" />
        <ControlSkeleton className="w-28" />
      </TabActions>
      <TableSkeleton columns={3} rows={3} label="Loading Candidates" />
    </>
  );
}

// Activity's day heading and its rule over its log lines
export function ActivitySkeleton() {
  return (
    <div role="status" aria-label="Loading Activity" className="flex flex-col gap-2">
      <div className="flex h-7 items-center border-b border-divider pb-2">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex flex-col">
        {EVENT_WIDTHS.map((width) => (
          <div key={width} className="flex h-8 items-center gap-3">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className={width} />
          </div>
        ))}
      </div>
    </div>
  );
}

// the Candidate page's title, its actions at the tab row's end, the verdict line, rationale and Fix card
export function CandidateSkeleton() {
  return (
    <div role="status" aria-label="Loading Candidate" className="flex flex-col gap-4">
      <TabActions>
        <ControlSkeleton className="w-16" />
        <ControlSkeleton className="w-20" />
      </TabActions>
      <div className="flex h-6 items-center">
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="flex h-5 items-center gap-2">
        <Skeleton className="h-5 w-24 rounded-xs" />
        <Skeleton className="h-5 w-20 rounded-xs" />
      </div>
      <LinesSkeleton className="max-w-reading" />
      <div className="overflow-clip card">
        <div className="flex h-10 items-center border-b border-divider px-3">
          <Skeleton className="h-3 w-16" />
        </div>
        <LinesSkeleton lines={5} className="p-3" />
      </div>
    </div>
  );
}

// Compare's two Candidate pickers over the Evals that differ
export function CompareSkeleton() {
  return (
    <div role="status" aria-label="Loading Compare" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-6">
        <ControlSkeleton className="w-full" />
        <ControlSkeleton className="w-full" />
      </div>
      <TableSkeleton columns={3} rows={4} />
    </div>
  );
}
