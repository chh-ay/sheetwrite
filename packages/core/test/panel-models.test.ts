import { describe, expect, it } from "bun:test";

import {
  chartFromRange,
  DEFAULT_CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  nextChartId,
  selectionRange,
} from "../src/panels/chart-model.js";
import {
  defaultAggregation,
  pivotSourceFor,
  placeField,
  removeField,
  setSortOrder,
  shiftField,
  sourceDataRange,
  type FieldFacts,
} from "../src/panels/pivot-model.js";
import { formatRangeText, parseRangeText } from "../src/panels/range-text.js";
import type { CellScalar, PivotDefinition, Range, WorkbookTable } from "../src/types.js";

const SHEETS = [
  { id: "s1", name: "Sales", rowCount: 100, columns: { length: 10 } },
  { id: "s2", name: "Q1 Sales", rowCount: 10, columns: { length: 4 } },
];

const range = (sheet: string, r0: number, c0: number, r1: number, c1: number): Range => ({
  sheet,
  start: { row: r0, col: c0 },
  end: { row: r1, col: c1 },
});

/** Cells of a block that starts at A1, row-major. */
function reader(rows: CellScalar[][]): (row: number, col: number) => CellScalar {
  return (row, col) => rows[row]?.[col] ?? null;
}

describe("chart from a selection", () => {
  it("uses the first row as series names and the first column as categories when they are text", () => {
    const cells = [
      [null, "North", "South"],
      ["Jan", 1, 2],
      ["Feb", 3, 4],
    ];
    const chart = chartFromRange(range("s1", 0, 0, 2, 2), reader(cells), "chart-1", 10);

    expect(chart).toEqual({
      id: "chart-1",
      kind: "column",
      anchor: {
        row: 0,
        col: 3,
        offsetX: 0,
        offsetY: 0,
        width: DEFAULT_CHART_WIDTH,
        height: DEFAULT_CHART_HEIGHT,
      },
      series: [
        {
          values: range("s1", 1, 1, 2, 1),
          nameRange: range("s1", 0, 1, 0, 1),
          categories: range("s1", 1, 0, 2, 0),
        },
        {
          values: range("s1", 1, 2, 2, 2),
          nameRange: range("s1", 0, 2, 0, 2),
          categories: range("s1", 1, 0, 2, 0),
        },
      ],
    });
  });

  it("plots every cell when the block has no text headers", () => {
    const cells = [
      [1, 2],
      [3, 4],
    ];
    const chart = chartFromRange(range("s1", 0, 0, 1, 1), reader(cells), "chart-1", 10);

    expect(chart.series).toEqual([
      { values: range("s1", 0, 0, 1, 0) },
      { values: range("s1", 0, 1, 1, 1) },
    ]);
  });

  it("keeps a numeric first column as a series", () => {
    const cells = [
      ["Year", "Sales"],
      [2024, 5],
      [2025, 7],
    ];
    const chart = chartFromRange(range("s1", 0, 0, 2, 1), reader(cells), "chart-1", 10);

    expect(chart.series.map((series) => series.categories)).toEqual([undefined, undefined]);
    expect(chart.series.map((series) => series.nameRange)).toEqual([
      range("s1", 0, 0, 0, 0),
      range("s1", 0, 1, 0, 1),
    ]);
  });

  it("stays inside the sheet when the selection ends at the last column", () => {
    const chart = chartFromRange(range("s1", 4, 8, 6, 9), reader([]), "chart-1", 10);
    expect(chart.anchor.col).toBe(9);
    expect(chart.anchor.row).toBe(4);
  });

  it("names a chart with the first free ID", () => {
    const charts = [{ id: "chart-2" }, { id: "chart-3" }].map((partial) => ({
      ...chartFromRange(range("s1", 0, 0, 0, 0), reader([]), partial.id, 10),
    }));
    expect(nextChartId(charts)).toBe("chart-4");
    expect(nextChartId([])).toBe("chart-1");
  });

  it("resolves cells, ranges, rows and columns to rectangles", () => {
    expect(selectionRange(null, SHEETS)).toBeNull();
    expect(selectionRange({ kind: "cell", addr: { sheet: "s1", row: 2, col: 3 } }, SHEETS)).toEqual(
      range("s1", 2, 3, 2, 3),
    );
    expect(selectionRange({ kind: "range", range: range("s1", 5, 4, 1, 2) }, SHEETS)).toEqual(
      range("s1", 1, 2, 5, 4),
    );
    expect(selectionRange({ kind: "column", sheet: "s2", col: 1 }, SHEETS)).toEqual(
      range("s2", 0, 1, 9, 1),
    );
    expect(selectionRange({ kind: "row", sheet: "s2", row: 3 }, SHEETS)).toEqual(
      range("s2", 3, 0, 3, 3),
    );
  });
});

describe("A1 range text", () => {
  it("parses cells, ranges, $ markers and sheet prefixes", () => {
    expect(parseRangeText("B2:D9", SHEETS, "s1")).toEqual({ range: range("s1", 1, 1, 8, 3) });
    expect(parseRangeText(" $b$7 ", SHEETS, "s1")).toEqual({ range: range("s1", 6, 1, 6, 1) });
    expect(parseRangeText("D9:B2", SHEETS, "s1")).toEqual({ range: range("s1", 1, 1, 8, 3) });
    expect(parseRangeText("'Q1 Sales'!A1:B2", SHEETS, "s1")).toEqual({
      range: range("s2", 0, 0, 1, 1),
    });
    expect(parseRangeText("sales!C3", SHEETS, "s2")).toEqual({ range: range("s1", 2, 2, 2, 2) });
  });

  it("rejects malformed text, unknown sheets and cells outside the sheet", () => {
    expect(parseRangeText("hello", SHEETS, "s1")).toHaveProperty("error");
    expect(parseRangeText("A0", SHEETS, "s1")).toHaveProperty("error");
    expect(parseRangeText("Nope!A1", SHEETS, "s1")).toEqual({ error: "No sheet has this name." });
    expect(parseRangeText("'Q1 Sales'!E1", SHEETS, "s1")).toEqual({
      error: "The range is outside the sheet.",
    });
    expect(parseRangeText("A101", SHEETS, "s1")).toEqual({
      error: "The range is outside the sheet.",
    });
  });

  it("writes the sheet name only for another sheet, quoted when needed", () => {
    expect(formatRangeText(range("s1", 1, 1, 8, 3), SHEETS, "s1")).toBe("B2:D9");
    expect(formatRangeText(range("s2", 0, 0, 0, 0), SHEETS, "s1")).toBe("'Q1 Sales'!A1");
    expect(formatRangeText(range("s1", 0, 0, 1, 0), SHEETS, "s2")).toBe("Sales!A1:A2");
  });

  it("reads back what it writes", () => {
    const text = formatRangeText(range("s2", 2, 1, 4, 3), SHEETS, "s1");
    expect(parseRangeText(text, SHEETS, "s1")).toEqual({ range: range("s2", 2, 1, 4, 3) });
  });
});

describe("pivot field moves", () => {
  const base: PivotDefinition = {
    id: "p",
    name: "P",
    source: { range: range("s1", 0, 0, 9, 3) },
    anchor: { row: 0, col: 6 },
    rows: [],
    columns: [],
    values: [],
  };
  const facts = (type: FieldFacts["type"], values: CellScalar[] = []): FieldFacts => ({
    type,
    distinctValues: () => values,
  });

  it("sums numbers and counts other fields by default", () => {
    expect(defaultAggregation("number")).toBe("SUM");
    expect(defaultAggregation("text")).toBe("COUNTA");
    expect(placeField(base, 2, "values", facts("number")).values).toEqual([
      { field: 2, aggregation: "SUM" },
    ]);
  });

  it("moves a field between Rows and Columns, never keeping it on both", () => {
    const rows = placeField(base, 0, "rows", facts("text"));
    const moved = placeField(rows, 0, "columns", facts("text"), { area: "rows", index: 0 });
    expect(moved.rows).toEqual([]);
    expect(moved.columns).toEqual([0]);

    const again = placeField(moved, 0, "rows", facts("text"));
    expect(again.rows).toEqual([0]);
    expect(again.columns).toEqual([]);
  });

  it("keeps a value field's settings when it moves inside Values", () => {
    const pivot: PivotDefinition = {
      ...base,
      values: [
        { field: 1, aggregation: "MAX", name: "Top" },
        { field: 2, aggregation: "SUM" },
      ],
    };
    const next = shiftField(pivot, { area: "values", index: 0 }, 1, facts(undefined));
    expect(next.values).toEqual([
      { field: 2, aggregation: "SUM" },
      { field: 1, aggregation: "MAX", name: "Top" },
    ]);
    expect(shiftField(next, { area: "values", index: 1 }, 1, facts(undefined))).toBe(next);
  });

  it("starts a new filter with every value kept, and keeps a moved filter's list", () => {
    const filtered = placeField(base, 0, "filters", facts("text", ["East", "West"]));
    expect(filtered.filters).toEqual([{ field: 0, values: ["East", "West"] }]);

    const narrowed: PivotDefinition = { ...filtered, filters: [{ field: 0, values: ["East"] }] };
    const back = placeField(narrowed, 0, "filters", facts("text", ["ignored"]), {
      area: "filters",
      index: 0,
    });
    expect(back.filters).toEqual([{ field: 0, values: ["East"] }]);
  });

  it("drops the sort key of a field that leaves its axis", () => {
    const sorted = setSortOrder({ ...base, rows: [0, 1] }, "rows", 1, true);
    expect(sorted.sort).toEqual([{ axis: "rows", field: 1, descending: true }]);
    expect(setSortOrder(sorted, "rows", 1, false).sort).toEqual([]);

    const removed = removeField(sorted, { area: "rows", index: 1 });
    expect(removed.rows).toEqual([0]);
    expect(removed.sort).toEqual([]);
  });

  it("uses the table that holds the selection as the source", () => {
    const table = {
      id: "t1",
      name: "Orders",
      range: range("s1", 2, 1, 20, 4),
      columns: [],
      headerRow: true,
      totalsRow: true,
    } satisfies WorkbookTable;
    expect(pivotSourceFor(range("s1", 5, 2, 6, 2), [table])).toEqual({ table: "t1" });
    expect(pivotSourceFor(range("s1", 0, 0, 6, 2), [table])).toEqual({
      range: range("s1", 0, 0, 6, 2),
    });
    expect(sourceDataRange({ table: "t1" }, [table])).toEqual(range("s1", 3, 1, 19, 4));
    expect(sourceDataRange({ range: range("s1", 0, 0, 4, 1) }, [])).toEqual(
      range("s1", 1, 0, 4, 1),
    );
  });
});
