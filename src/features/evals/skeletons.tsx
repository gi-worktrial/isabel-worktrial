// Grounded Evals', an Eval's and its runs' route skeletons, in their layouts' shapes; route skeletons load with the first
// page, so this file imports only ui/skeleton
import { FiltersSkeleton, LinesSkeleton, PageSkeleton, TableSkeleton } from "#src/ui/skeleton";

// the search over the Evals table: Eval, result, last passed, Issues and Criteria
export function GroundedEvalsSkeleton() {
  return (
    <PageSkeleton
      title="Grounded Evals"
      label="Loading Grounded Evals"
      actions={<FiltersSkeleton />}
    >
      <TableSkeleton columns={5} rows={8} />
    </PageSkeleton>
  );
}

// the Eval's title, its facts (Reproduces and Folder) and its Definition and Runs tabs, then the definition's prompt
export function EvalSkeleton() {
  return (
    <PageSkeleton label="Loading Eval" meta tabs={["Definition", "Runs"]}>
      <LinesSkeleton lines={4} className="max-w-reading" />
    </PageSkeleton>
  );
}

// the Runs tab's trials table: first message, Grades, outcome, errors, tokens and time
export function EvalRunsSkeleton() {
  return <TableSkeleton columns={6} rows={6} label="Loading runs" />;
}
