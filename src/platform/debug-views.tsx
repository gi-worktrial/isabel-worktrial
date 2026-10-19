import type { ReactNode } from "react";

import type { DebugSearch } from "#/debug-search";
import { IssueTraceTable } from "#/issue-traces";
import { Tab, Tabs } from "#/ui/tabs";
import { TabActionsEnd } from "#src/ui/tab-actions";

/** Debug's Files, Grades, and Traces tabs. Files stays mounted while hidden so its unsaved edits survive. */
export function DebugViews({
  search: { view, afters = [] },
  files,
  grades,
}: {
  search: DebugSearch;
  files: ReactNode;
  grades: ReactNode;
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
          Files
        </Tab>
        <Tab
          to="."
          search={{ view: "grades" }}
          aria-current={view === "grades" ? "page" : undefined}
        >
          Grades
        </Tab>
        <Tab
          to="."
          search={{ view: "traces" }}
          aria-current={view === "traces" ? "page" : undefined}
        >
          Traces
        </Tab>
        <TabActionsEnd />
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
