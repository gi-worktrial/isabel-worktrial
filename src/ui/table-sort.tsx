import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "#/ui/cn";
import type { Column } from "#src/ui/table";

export interface Sort<Key extends string> {
  key: Key;
  dir: "asc" | "desc";
}

export interface Sorting {
  sort: Sort<string> | null;
  onSort(sort: Sort<string>): void;
}

export type SortValue = string | number | null;

function compareValues(left: SortValue, right: SortValue): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  // an empty cell sorts first
  if (left === null || right === null) {
    return Number(left !== null) - Number(right !== null);
  }
  return String(left).localeCompare(String(right));
}

export function sortRows<Row, Key extends string>(
  rows: readonly Row[],
  sort: Sort<Key> | null,
  value: (row: Row, key: Key) => SortValue,
): readonly Row[] {
  if (sort === null) {
    return rows;
  }
  const sign = sort.dir === "desc" ? -1 : 1;
  return rows.toSorted(
    (left, right) => sign * compareValues(value(left, sort.key), value(right, sort.key)),
  );
}

// a column sorts by its own value, or by its cell when the cell is plain text or a number
export const sortValue = <Row,>(column: Column<Row>) =>
  column.sort ??
  ((row: Row) => {
    const shown = column.cell(row);
    return typeof shown === "string" || typeof shown === "number" ? shown : null;
  });

// rows in the order a table shows them under `sort`, for pagers that step through it
export const sortByColumns = <Row,>(
  rows: readonly Row[],
  columns: ReadonlyArray<Column<Row>>,
  sort: Sort<string> | null,
) => {
  const values = new Map(columns.map((column) => [column.id, sortValue(column)]));
  return sortRows(rows, sort, (row, key) => values.get(key)?.(row) ?? null);
};

export function SortHeader({
  label,
  right,
  sort,
  id,
  onSort,
}: {
  label: ReactNode;
  right: boolean;
  sort: Sort<string> | null;
  id: string;
  onSort(sort: Sort<string>): void;
}) {
  const active = sort?.key === id;
  const Chevron = active && sort.dir === "desc" ? ChevronDown : ChevronUp;
  return (
    <button
      type="button"
      onClick={() => onSort({ key: id, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
      className={cn(
        "group -mx-2 flex h-7 items-center gap-1 rounded-xs px-2 hover:bg-fill hover:text-ink",
        // right headers sit over numeric cells, the arrow on the inside
        right && "ml-auto flex-row-reverse",
      )}
    >
      {label}
      <Chevron
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0 text-muted",
          !active && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      />
    </button>
  );
}
