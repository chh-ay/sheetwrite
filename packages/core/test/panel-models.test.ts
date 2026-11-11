import { describe, expect, it } from "bun:test";

import { sanitizeChartDefinition } from "../src/chart-definition.js";
import { pivotChartView } from "../src/dashboard/dashboard-chart.js";
import {
  pivotValueCaptions,
  plotsPivotValue,
  selectionRange,
  withPivotValue,
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
  withMeasureValue,
} from "../src/panels/pivot-model.js";
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

describe("chart from a selection", () => {
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

describe("values of a chart over a pivot", () => {
  const chart = {
    id: "c1",
    kind: "column" as const,
    anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 480, height: 288 },
    series: [],
    pivot: "p1",
  };

  it("captions values as the Field List does: own name, measure name, or aggregation of field", () => {
    const captions = pivotValueCaptions(
      [
        { field: 1, aggregation: "SUM" },
        { measure: "m1" },
        { field: 2, aggregation: "COUNTA", name: "Orders" },
        { measure: "gone" },
      ],
      (field) => ["Region", "Amount", "Id"][field] ?? "",
      (id) => (id === "m1" ? "Margin" : undefined),
    );
    expect(captions).toEqual(["Sum of Amount", "Margin", "Orders", "gone"]);
  });

  it("toggles one value, keeps at least one, and drops the list when every value is plotted", () => {
    const one = withPivotValue(chart, 3, 0, false);
    expect(one?.pivotValues).toEqual([1, 2]);
    expect(plotsPivotValue(one ?? chart, 0)).toBe(false);
    const only = withPivotValue(withPivotValue(one ?? chart, 3, 1, false) ?? chart, 3, 2, false);
    expect(only).toBeNull();
    expect(withPivotValue(one ?? chart, 3, 0, true)).toEqual(chart);
  });

  it("accepts value positions only on a chart over a pivot, distinct and in bounds", () => {
    expect(sanitizeChartDefinition({ ...chart, pivotValues: [2, 0] })?.pivotValues).toEqual([2, 0]);
    const { pivot: _pivot, ...plain } = chart;
    for (const invalid of [
      { ...plain, pivotValues: [0] },
      { ...chart, pivotValues: [] },
      { ...chart, pivotValues: [1, 1] },
      { ...chart, pivotValues: [-1] },
      { ...chart, pivotValues: [0.5] },
      { ...chart, pivotValues: [32] },
    ]) {
      expect(sanitizeChartDefinition(invalid)).toBeNull();
    }
  });

  it("fills the category levels from the outer row fields, outermost first", () => {
    // Year, then region, then segment, in tabular layout: a repeated outer label is blank.
    const output = {
      rows: 6,
      cols: 4,
      headerRows: 1,
      labelCols: 3,
      cells: [
        ...["Year", "Region", "Segment", "Sum of Amount"],
        ...[2024, "East", "Online", 1],
        ...[null, null, "Retail", 2],
        ...[null, "West", "Retail", 3],
        ...[2025, "West", "Retail", 4],
        ...[null, null, "Online", 5],
      ],
    };
    const [series] = pivotChartView(chart, output, []).series;

    expect(series?.categories).toEqual(["Online", "Retail", "Retail", "Retail", "Online"]);
    // West under 2025 starts a new group because the year group starts there.
    expect(series?.categoryLevels).toEqual([
      { labels: [2024, null, null, 2025, null], formats: [null, null, null, null, null] },
      { labels: ["East", null, "West", "West", null], formats: [null, null, null, null, null] },
    ]);
    expect(series?.values).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("measures in the field list and the Measures panel", () => {
  const orders: WorkbookTable = {
    id: "orders",
    name: "Orders",
    range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } },
    columns: [
      { id: "region", name: "Region" },
      { id: "amount", name: "Amount" },
    ],
    headerRow: true,
    totalsRow: false,
  };
  const pivot: PivotDefinition = {
    id: "p1",
    name: "P1",
    source: { table: "orders" },
    anchor: { row: 0, col: 4 },
    rows: [0],
    columns: [],
    values: [{ field: 1, aggregation: "SUM" }],
  };

  it("adds a measure as the last value, turning a table source into a model source", () => {
    const next = withMeasureValue(pivot, [orders], "total");
    expect(next?.source).toEqual({
      model: {
        table: "orders",
        fields: [
          { table: "orders", column: "region" },
          { table: "orders", column: "amount" },
        ],
      },
    });
    expect(next?.values).toEqual([{ field: 1, aggregation: "SUM" }, { measure: "total" }]);
    expect(next && withMeasureValue(next, [orders], "total")).toBeNull();
    const range = {
      ...pivot,
      source: { range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } } },
    };
    expect(withMeasureValue(range, [orders], "total")).toBeNull();
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
