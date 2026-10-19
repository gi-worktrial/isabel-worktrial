import type { ReactNode } from "react";

import { cn } from "#/ui/cn";
import { Skeleton } from "#/ui/skeleton";

// layout shapes built from platform's Skeleton keep the real layout's sizes (Page's rows, Facts, the 32px tab row,
// Table's 36px rows), so nothing moves when the data arrives, and a shape given a `label` announces itself as loading

const status = (label: string | undefined) =>
  label === undefined ? {} : { "role": "status", "aria-label": label };

const LINE_WIDTHS = ["w-full", "w-11/12", "w-2/3", "w-5/6", "w-3/4"];
const CELL_WIDTHS = ["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-1/3"];
const FACT_WIDTHS = ["w-24", "w-20", "w-28", "w-16"];

/** Lines of prose, a log or code. */
export function LinesSkeleton({
  lines = 3,
  label,
  className,
}: {
  lines?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div {...status(label)} className={cn("flex flex-col gap-3", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn("h-3", LINE_WIDTHS[index % LINE_WIDTHS.length])} />
      ))}
    </div>
  );
}

/** A `Table` in its card: the header over a hairline, then rows with no lines between them; `inCard` drops the frame. */
export function TableSkeleton({
  rows = 5,
  columns = 3,
  inCard = false,
  label,
}: {
  rows?: number;
  columns?: number;
  inCard?: boolean;
  label?: string;
}) {
  const rest = Array.from({ length: columns - 1 }, (_, index) => index);
  const row = (key: number, primary: string, header: boolean) => (
    <div
      key={key}
      className={cn(
        "flex h-9 items-center gap-6",
        inCard ? "px-4" : "px-3",
        header && "border-b border-divider",
      )}
    >
      <div className="flex min-w-0 flex-1">
        <Skeleton className={cn("h-3", primary)} />
      </div>
      {rest.map((column) => (
        <Skeleton key={column} className={cn("h-3 shrink-0", header ? "w-12" : "w-16")} />
      ))}
    </div>
  );

  return (
    <div {...status(label)} className={cn("min-w-0 overflow-clip", !inCard && "card")}>
      {row(-1, "w-20", true)}
      {Array.from({ length: rows }, (_, index) =>
        row(index, CELL_WIDTHS[index % CELL_WIDTHS.length] ?? "w-1/2", false),
      )}
    </div>
  );
}

/** A record's meta line of facts. */
export function FactsSkeleton({ facts = 4 }: { facts?: number }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
      {Array.from({ length: facts }, (_, index) => (
        <div key={index} className="flex h-6 items-center">
          <Skeleton className={cn("h-3", FACT_WIDTHS[index % FACT_WIDTHS.length])} />
        </div>
      ))}
    </div>
  );
}

/** A tab row whose tabs are known, in the tabs' pill shape over their one hairline. */
export function TabsSkeleton({ tabs, className }: { tabs: readonly string[]; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex gap-1 border-b border-divider pb-2", className)}>
      {tabs.map((tab) => (
        <span key={tab} className="flex h-8 items-center px-3 type-label-13 font-medium text-muted">
          {tab}
        </span>
      ))}
    </div>
  );
}

/** A list page's toolbar for `PageSkeleton`'s actions: its view or source control (in `control`'s width), then search. */
export function FiltersSkeleton({ control }: { control?: string }) {
  return (
    <>
      {control !== undefined && <ControlSkeleton className={control} />}
      <ControlSkeleton className="w-64 max-w-full" />
    </>
  );
}

/**
 * A page while it loads: its title (the words when the page names itself, else a bar), its actions' placeholders,
 * the meta line, the tabs and the body, in the page's own spacing.
 */
export function PageSkeleton({
  title,
  label = "Loading",
  actions,
  meta = false,
  tabs,
  children,
}: {
  title?: string;
  label?: string;
  actions?: ReactNode;
  meta?: boolean;
  tabs?: readonly string[];
  children?: ReactNode;
}) {
  return (
    <div role="status" aria-label={label} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 basis-64 items-center">
            {title === undefined ? (
              <Skeleton className="h-5 w-64 max-w-full" />
            ) : (
              <span aria-hidden="true" className="truncate type-title-18 text-ink">
                {title}
              </span>
            )}
          </div>
          {actions === undefined ? null : (
            <div className="ml-auto flex max-w-full shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
        {meta && <FactsSkeleton />}
      </div>
      {tabs !== undefined && <TabsSkeleton tabs={tabs} />}
      {children}
    </div>
  );
}

/** A control's grey field or button while it loads, in its real width. */
export function ControlSkeleton({ className }: { className: string }) {
  return <Skeleton className={cn("h-8", className)} />;
}

/**
 * A settings page's field groups: anything above the groups (`lead`), then each group's title over its rows (a label
 * and value each, or a table).
 */
export function FieldsSkeleton({
  lead,
  groups,
}: {
  lead?: ReactNode;
  groups: ReadonlyArray<{ title: string; rows: number; table?: boolean }>;
}) {
  return (
    <div className="flex max-w-4xl min-w-0 flex-col gap-10">
      {lead}
      {groups.map(({ title, rows, table = false }) => (
        <div key={title} className="flex flex-col">
          <span aria-hidden="true" className="pb-2 type-heading-15 text-[16px]/[24px] text-ink">
            {title}
          </span>
          {table ? (
            <TableSkeleton columns={4} rows={rows} />
          ) : (
            <div className="flex flex-col gap-3">
              {Array.from({ length: rows }, (_, index) => (
                <div
                  key={index}
                  className="grid gap-x-6 gap-y-1 md:grid-cols-[200px_minmax(0,1fr)]"
                >
                  <div className="flex min-h-8 items-center">
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="flex min-h-8 items-center">
                    <Skeleton className={cn("h-3", CELL_WIDTHS[index % CELL_WIDTHS.length])} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
