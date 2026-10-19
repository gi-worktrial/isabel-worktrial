import { useSuspenseQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Suspense } from "react";

import { type IssueParams, issueEventsQuery } from "#/queries";
import { IconButton } from "#/ui/button";
import { Skeleton } from "#/ui/skeleton";
import { ActivityLog } from "#src/features/issue/activity-log";

export function IssueActivityPanel({ params, onClose }: { params: IssueParams; onClose(): void }) {
  return (
    <section aria-label="Issue activity" className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-divider px-4">
        <h2 className="min-w-0 flex-1 truncate type-heading-15 text-ink">Activity</h2>
        <IconButton label="Close activity" size="small" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Suspense fallback={<ActivityLoading />}>
          <Activity params={params} />
        </Suspense>
      </div>
    </section>
  );
}

function Activity({ params }: { params: IssueParams }) {
  const { events, names } = useSuspenseQuery(issueEventsQuery(params)).data;
  return <ActivityLog events={events} names={names} params={params} />;
}

function ActivityLoading() {
  return (
    <div role="status" aria-label="Loading activity" className="flex flex-col gap-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-8 w-11/12" />
    </div>
  );
}
