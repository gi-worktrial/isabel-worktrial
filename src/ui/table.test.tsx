import { expect, test } from "vitest";

import { type Column, RowAction, sortByColumns, sortRows } from "#src/ui/table";

interface Row {
  name: string;
  state: "open" | "closed";
  count: number;
}

const ROWS: Row[] = [
  { name: "Beta", state: "open", count: 2 },
  { name: "Alpha", state: "open", count: 9 },
  { name: "Gamma", state: "closed", count: 5 },
];

const COLUMNS: Array<Column<Row>> = [
  {
    id: "name",
    label: "Name",
    kind: "primary",
    sort: (row) => row.name,
    cell: (row) => <RowAction>{row.name}</RowAction>,
  },
  {
    id: "count",
    label: "Count",
    kind: "number",
    sort: (row) => row.count,
    cell: (row) => row.count,
  },
  { id: "state", label: "State", kind: "id", cell: (row) => row.state },
  { id: "run", label: "", kind: "actions", cell: () => <button type="button">Run</button> },
];

test("no sort keeps the original rows without reading their values", () => {
  expect(
    sortRows(ROWS, null, () => {
      throw new Error("An unsorted table must not read sort values");
    }),
  ).toBe(ROWS);
});

test("sorts put empty values first ascending, compare numbers numerically and keep ties stable", () => {
  const rows = [
    { id: "first", value: 10 },
    { id: "empty", value: null },
    { id: "second", value: 2 },
    { id: "tie", value: 2 },
  ];
  expect(
    sortRows(rows, { key: "value", dir: "asc" }, (row) => row.value).map((row) => row.id),
  ).toEqual(["empty", "second", "tie", "first"]);
  expect(
    sortRows(rows, { key: "value", dir: "desc" }, (row) => row.value).map((row) => row.id),
  ).toEqual(["first", "second", "tie", "empty"]);
  expect(rows.map((row) => row.id)).toEqual(["first", "empty", "second", "tie"]);
});

test("column sorting uses explicit values before cells and keeps unknown columns in input order", () => {
  expect(sortByColumns(ROWS, COLUMNS, { key: "name", dir: "asc" }).map((row) => row.name)).toEqual([
    "Alpha",
    "Beta",
    "Gamma",
  ]);
  expect(sortByColumns(ROWS, COLUMNS, { key: "unknown", dir: "desc" })).toEqual(ROWS);
  expect(sortByColumns(ROWS, COLUMNS, { key: "state", dir: "asc" }).map((row) => row.name)).toEqual(
    ["Gamma", "Beta", "Alpha"],
  );
});
