import type { ReactNode } from "react";

import type { DebugSearch } from "#/debug-search";
import { IssueTraceTable } from "#/issue-traces";
import { Tab, Tabs } from "#/ui/tabs";
import { Count } from "#src/ui/count";
import { TabActionsEnd } from "#src/ui/tab-actions";
import { LineCounts } from "#src/ui/file-name";

const TAB_COUNT =
  "group-aria-[current=page]/tab:bg-divider group-aria-[current=page]/tab:text-ink";

/** Debug's Files, Grades, and Traces tabs. Files stays mounted while hidden so its unsaved edits survive. */
export function DebugViews({
  search: { view, afters = [] },
  files,
  grades,
  fileSummary,
  gradeBadges,
  traceCount,
}: {
  search: DebugSearch;
  files: ReactNode;
  grades: ReactNode;
  fileSummary?: { count: number; added: number; removed: number };
  gradeBadges?: ReactNode;
  traceCount?: number;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <Tabs label="Views" className="shrink-0">
        <Tab
          to="."
          search={{}}
          activeOptions={{ exact: true }}
          aria-current={view === undefined ? "page" : undefined}
        >
          {fileSummary === undefined ? (
            "Files"
          ) : (
            <>
              Files changed
              <Count className={TAB_COUNT}>{fileSummary.count}</Count>
            </>
          )}
        </Tab>
        <Tab
          to="."
          search={{ view: "grades" }}
          aria-current={view === "grades" ? "page" : undefined}
        >
          Grades
          {gradeBadges}
        </Tab>
        <Tab
          to="."
          search={{ view: "traces" }}
          aria-current={view === "traces" ? "page" : undefined}
        >
          Traces
          {traceCount === undefined ? null : <Count className={TAB_COUNT}>{traceCount}</Count>}
        </Tab>
        <TabActionsEnd />
        {view === undefined && fileSummary !== undefined && (
          <LineCounts
            added={fileSummary.added}
            removed={fileSummary.removed}
            className="type-mono-12"
          />
        )}
      </Tabs>
      <div className={view === undefined ? "flex min-h-0 flex-1" : "hidden"}>{files}</div>
      {view === "grades" && (
        <section aria-label="Grades" className="min-h-0 flex-1 overflow-auto card">
          {grades}
        </section>
      )}
      {view === "traces" && (
        <div className="min-h-0 flex-1 overflow-auto">
          <IssueTraceTable afters={afters} />
        </div>
      )}
    </div>
  );
}
