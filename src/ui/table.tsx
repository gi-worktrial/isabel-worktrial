import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "#/ui/cn";
import { Timestamp } from "#/ui/timestamp";
import { Chip } from "#src/ui/chip";
import { useResize } from "#src/ui/dom-hooks";
import {
  SortHeader,
  sortByColumns,
  sortValue,
  type Sort,
  type Sorting,
  type SortValue,
} from "#src/ui/table-sort";

export { RowAction, RowActions } from "#src/ui/table-row-actions";
export { sortByColumns, sortRows, type Sort } from "#src/ui/table-sort";

type Box = (props: { children: ReactNode }) => ReactNode;

// the primary column takes the spare width and truncates, and others sit at content width between `min` and `max`
const KINDS = {
  // the name, filling the free width
  primary: { min: 10, max: "w-full max-w-0", cell: "text-ink" },
  text: { min: 6, max: "max-w-64", cell: "text-muted" },
  // an outcome or state as one tag
  status: { min: 6, max: "max-w-56", cell: "" },
  // a few tags such as Annotations, the last ones cut in a narrow table
  tags: { min: 7, max: "max-w-md @max-3xl:max-w-64", cell: "" },
  // a linked record such as "Trace 24" as a chip
  id: { min: 6, max: "max-w-44", cell: "", box: Chip },
  // a measure such as a count, duration or cost
  number: { min: 5, cell: "text-right text-muted tabular-nums" },
  // the time, quiet in the last column
  time: { min: 6, cell: "text-right text-muted tabular-nums" },
  // shown only while the row is hovered or focused
  actions: { min: 0, max: "w-px", cell: "row-actions text-right" },
  // an always-there control at the end, such as a switch
  control: { min: 0, max: "w-px", cell: "text-right" },
} satisfies Record<string, KindSpec>;

interface KindSpec {
  min: number;
  max?: string;
  cell: string;
  box?: Box;
}
type ColumnKind = keyof typeof KINDS;
const kind = (column: { kind?: ColumnKind | undefined }) => column.kind ?? "text";
const spec = (column: { kind?: ColumnKind | undefined }): KindSpec => KINDS[kind(column)];
const RIGHT = new Set<ColumnKind>(["number", "time", "actions", "control"]);
const UNSORTED = new Set<ColumnKind>(["actions", "control"]);
// a fixed layout keeps a status column at the width it took before, so its words are never cut, and a number or a time
// too while the name keeps its own minimum beside them; the name and the rest share what is left
const MEASURES = new Set<ColumnKind>(["number", "time"]);
const REM_PX = 16;
// a narrow table hides `drop` 1 columns below 48rem of table width and 2 below 32rem
const DROPS = { 1: "@max-3xl:hidden", 2: "@max-lg:hidden" };

export interface Column<Row> {
  id: string;
  label: ReactNode;
  kind?: ColumnKind;
  cell(row: Row): ReactNode;
  // the value the header sorts by, when the cell is not plain text or a number
  sort?(row: Row): SortValue;
  // lower-priority columns hide in a narrow table, 1 before 2
  drop?: 1 | 2;
  // classes on every cell, e.g. "text-ink"
  className?: string;
}

// sorts by the time with an empty one first, and reads in the one format
export function timeColumn<Row>(
  id: string,
  label: string,
  at: (row: Row) => string | null | undefined,
  extra: Partial<Column<Row>> = {},
): Column<Row> {
  return {
    id,
    label,
    kind: "time",
    sort: (row) => {
      const value = at(row) ?? null;
      return value === null ? null : Date.parse(value);
    },
    cell: (row) => {
      const value = at(row) ?? null;
      return value === null ? null : <Timestamp at={value} />;
    },
    ...extra,
  };
}

// rows open through a `RowAction` in their primary cell, and `sorting` hands the sort to the page
// `inCard` drops the card border so the 16px cells line up with an Issue card's sections
export function Table<Row>({
  label,
  columns,
  rows,
  rowKey,
  initial = null,
  sorting,
  selected,
  detail,
  empty = null,
  inCard = false,
  className,
}: {
  label: string;
  columns: ReadonlyArray<Column<Row>>;
  rows: readonly Row[];
  rowKey(row: Row): string;
  initial?: Sort<string> | null;
  sorting?: Sorting;
  selected?(row: Row): boolean;
  detail?(row: Row): ReactNode;
  empty?: ReactNode;
  inCard?: boolean;
  className?: string;
}) {
  const [own, setOwn] = useState(initial);
  const { sort, onSort } = sorting ?? { sort: own, onSort: setOwn };
  const sorted = sortByColumns(rows, columns, sort);
  // with no primary column nothing takes the spare width, so the frame ends at the last column
  const fit = !columns.some((column) => kind(column) === "primary");
  // a table wider than its container hides its `drop` columns and lays out fixed until the container fits again
  const box = useRef<HTMLDivElement>(null);
  // `room` is the container's width while the layout is fixed
  const [needed, setNeeded] = useState<{ width: number; heads: number[]; room: number } | null>(
    null,
  );
  useResize(box, (wrap) => {
    const table = wrap.querySelector("table");
    if (table === null) {
      return;
    }
    const room = wrap.clientWidth;
    setNeeded((was) => {
      if (was !== null) {
        return room >= was.width ? null : was.room === room ? was : { ...was, room };
      }
      const width = table.getBoundingClientRect().width;
      return width > room + 1
        ? {
            width,
            heads: [...table.querySelectorAll("thead th")].map(
              (th) => th.getBoundingClientRect().width,
            ),
            room,
          }
        : null;
    });
  });
  const fixed = needed !== null;
  const held = (column: Column<Row>) => spec(column).min === 0 || kind(column) === "status";
  const measures =
    needed !== null &&
    needed.room -
      columns.reduce(
        (sum, column, index) =>
          column.drop === undefined && (held(column) || MEASURES.has(kind(column)))
            ? sum + (needed.heads[index] ?? 0)
            : sum,
        0,
      ) >=
      KINDS.primary.min * REM_PX;
  const widths = (column: Column<Row>, index: number): CSSProperties => {
    // a fixed layout cannot fit a column to its buttons or tag, so it keeps the width they took before
    if (fixed && (held(column) || (measures && MEASURES.has(kind(column))))) {
      return { width: needed.heads[index] };
    }
    const { min } = spec(column);
    return min === 0 ? {} : { minWidth: `${min}rem` };
  };
  const sized = (column: Column<Row>) =>
    cn(
      !fixed && spec(column).max,
      column.drop === undefined ? "" : fixed ? "hidden" : DROPS[column.drop],
      column.className,
    );
  const sortable = (column: Column<Row>) =>
    !UNSORTED.has(kind(column)) &&
    (column.sort !== undefined || rows.some((row) => sortValue(column)(row) !== null));
  const renderRow = (row: Row) => {
    const more = detail?.(row) ?? null;
    return (
      <Fragment key={rowKey(row)}>
        <tr data-selected={selected?.(row) === true ? "true" : undefined}>
          {columns.map((column) => {
            const { cell, box: Box } = spec(column);
            const shown = column.cell(row);
            return (
              <td key={column.id} className={cn(cell, sized(column))}>
                {Box === undefined || shown === null || shown === undefined ? (
                  shown
                ) : (
                  <Box>{shown}</Box>
                )}
              </td>
            );
          })}
        </tr>
        {more === null ? null : (
          <tr>
            <td colSpan={columns.length} className="h-auto p-0 whitespace-normal">
              {more}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };
  const table = (
    <table
      className={cn(
        "record-table",
        fixed && "table-fixed",
        inCard && "[&_thead]:top-[var(--sticky-top,0px)]",
      )}
      aria-label={label}
    >
      <thead>
        <tr>
          {columns.map((column, index) => {
            const right = RIGHT.has(kind(column));
            const active = sort?.key === column.id;
            return (
              <th
                key={column.id}
                className={cn(right && "text-right", fixed && "overflow-hidden", sized(column))}
                style={widths(column, index)}
                aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
              >
                {sortable(column) ? (
                  <SortHeader
                    id={column.id}
                    label={column.label}
                    right={right}
                    sort={sort}
                    onSort={onSort}
                  />
                ) : (
                  column.label
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 && empty !== null ? (
          <tr>
            <td colSpan={columns.length} className="h-auto">
              {empty}
            </td>
          </tr>
        ) : null}
        {sorted.map(renderRow)}
      </tbody>
    </table>
  );
  return (
    <div ref={box} className={cn("@container min-w-0", inCard && "[--cell-x:16px]", className)}>
      <div className={cn(!inCard && "overflow-clip card", fit && !fixed && "w-fit max-w-full")}>
        {table}
      </div>
    </div>
  );
}
