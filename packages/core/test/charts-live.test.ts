import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import { MAX_CHART_POINTS, resolveChartView, subscribeChartChanges } from "../src/charts-live.js";
import { initSheetwrite } from "../src/grid.js";
import type {
  ChartChangeEvent,
  ChartDefinition,
  DocumentOp,
  Range,
  Sheet,
  Workbook,
} from "../src/index.js";
import { SheetwriteStore } from "../src/store.js";

beforeAll(async () => {
  await initSheetwrite();
});

const stores: SheetwriteStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
});

function sheet(id: string, rowCount: number): Sheet {
  const columns = ["a", "b", "c", "d"].map((key) => ({
    key,
    header: key,
    width: 80,
    type: "number" as const,
  }));
  return { id, name: id, rowCount, columns };
}

function workbook(rowCount: number, extraSheets = 0): Workbook {
  const sheets = [sheet("data", rowCount), sheet("other", rowCount)];
  for (let index = 0; index < extraSheets; index++) sheets.push(sheet(`extra${index}`, rowCount));
  return { activeSheet: "data", sheets };
}

function range(sheetId: string, r0: number, c0: number, r1: number, c1: number): Range {
  return { sheet: sheetId, start: { row: r0, col: c0 }, end: { row: r1, col: c1 } };
}

function chart(id: string, values: Range, categories?: Range): ChartDefinition {
  return {
    id,
    kind: "column",
    anchor: { row: 0, col: 3, offsetX: 0, offsetY: 0, width: 400, height: 300 },
    series: [{ values, ...(categories ? { categories } : {}) }],
  };
}

function apply(store: SheetwriteStore, patches: DocumentOp[]): void {
  expect(store.applyTransaction({ patches }).status).toBe("applied");
}

function set(sheetId: string, row: number, col: number, value: number | string): DocumentOp {
  return { op: "set", addr: { sheet: sheetId, row, col }, value: { kind: "literal", value } };
}

function formula(sheetId: string, row: number, col: number, src: string): DocumentOp {
  return { op: "set", addr: { sheet: sheetId, row, col }, value: { kind: "formula", src } };
}

function setup(rowCount = 10, extraSheets = 0) {
  const store = new SheetwriteStore(workbook(rowCount, extraSheets));
  stores.push(store);
  apply(store, [
    set("data", 0, 0, "Q1"),
    set("data", 1, 0, "Q2"),
    set("data", 0, 1, 10),
    set("data", 1, 1, 20),
    {
      op: "setChart",
      sheet: "data",
      chart: chart("sales", range("data", 0, 1, 1, 1), range("data", 0, 0, 1, 0)),
    },
  ]);

  const events: ChartChangeEvent[] = [];
  const unsubscribe = subscribeChartChanges(store, (event) => events.push(event));
  return { store, events, unsubscribe };
}

describe("chart change events", () => {
  it("names a chart once when an edit touches its series and stays silent otherwise", () => {
    const { store, events } = setup();

    // Two cells of the same series in one commit still produce one event naming the chart once.
    apply(store, [set("data", 0, 1, 11), set("data", 1, 1, 21)]);
    expect(events).toHaveLength(1);
    expect(events[0]?.charts).toEqual([{ sheet: "data", id: "sales" }]);

    // Outside every series range: same sheet, another column, and another sheet at the same address.
    apply(store, [set("data", 5, 2, 1), set("other", 0, 1, 99)]);
    expect(events).toHaveLength(1);
  });

  it("matches edits through the index without reading chart definitions", () => {
    // Many charts on other sheets; a scan over all of them would read every sheet's charts.
    const { store, events } = setup(10, 40);
    const patches: DocumentOp[] = [];
    for (let index = 0; index < 40; index++) {
      for (let slot = 0; slot < 50; slot++) {
        patches.push({
          op: "setChart",
          sheet: `extra${index}`,
          chart: chart(`c${slot}`, range(`extra${index}`, slot % 10, 2, slot % 10, 2)),
        });
      }
    }
    apply(store, patches);
    events.length = 0;

    let reads = 0;
    for (const live of store.getWorkbook().sheets) {
      let charts = live.charts;
      Object.defineProperty(live, "charts", {
        configurable: true,
        enumerable: true,
        get() {
          reads++;
          return charts;
        },
        set(value: Sheet["charts"]) {
          charts = value;
        },
      });
    }

    apply(store, [set("data", 0, 1, 12)]);
    apply(store, [set("data", 7, 3, 1)]);
    expect(events.map((event) => event.charts)).toEqual([[{ sheet: "data", id: "sales" }]]);
    expect(reads).toBe(0);
  });

  it("follows recalculated values when a series reads a formula", () => {
    const { store, events } = setup();
    apply(store, [formula("data", 1, 1, "=C9*2")]);
    expect(events).toHaveLength(1);

    // C9 sits outside the series, but the series cell's value changes through the formula.
    apply(store, [set("data", 8, 2, 7)]);
    expect(events).toHaveLength(2);
    expect(resolveChartView(store, "data", "sales")?.series[0]?.values).toEqual([10, 14]);
  });

  it("follows a spill written outside the series that reaches into it", () => {
    const { store, events } = setup();
    apply(store, [
      { op: "setChart", sheet: "data", chart: chart("spill", range("data", 4, 1, 6, 1)) },
    ]);
    events.length = 0;

    // A4 spills three rows by two columns, covering the series B5:B7 from outside it.
    apply(store, [set("data", 9, 2, 1), formula("data", 4, 0, "=SEQUENCE(3,2,C10)")]);
    expect(events.at(-1)?.charts).toContainEqual({ sheet: "data", id: "spill" });

    // Changing the spill's input, outside every series, must refresh the chart.
    const before = events.length;
    apply(store, [set("data", 9, 2, 100)]);
    expect(events).toHaveLength(before + 1);
    expect(resolveChartView(store, "data", "spill")?.series[0]?.values).toEqual([101, 103, 105]);
  });

  it("follows an existing spill that grows into a previously empty series", () => {
    const { store, events } = setup();
    apply(store, [set("data", 9, 2, 1), formula("data", 4, 0, "=SEQUENCE(C10,2)")]);
    apply(store, [
      { op: "setChart", sheet: "data", chart: chart("growth", range("data", 5, 1, 6, 1)) },
    ]);
    events.length = 0;

    apply(store, [set("data", 9, 2, 3)]);
    expect(events).toHaveLength(1);
    expect(events[0]?.charts).toContainEqual({ sheet: "data", id: "growth" });
    expect(resolveChartView(store, "data", "growth")?.series[0]?.values).toEqual([4, 6]);
  });

  it("reports number-format edits on a series and ignores other styling", () => {
    const { store, events } = setup();
    apply(store, [
      { op: "setRangeStyle", range: range("data", 0, 1, 0, 1), style: { bold: true } },
    ]);
    expect(events).toHaveLength(0);

    apply(store, [
      { op: "setRangeStyle", range: range("data", 0, 1, 0, 1), style: { numberFormat: "0%" } },
    ]);
    expect(events).toHaveLength(1);

    apply(store, [{ op: "setColumn", sheet: "data", col: 2, patch: { numberFormat: "0.0" } }]);
    expect(events).toHaveLength(1);
    apply(store, [{ op: "setColumn", sheet: "data", col: 1, patch: { numberFormat: "0.0" } }]);
    expect(events).toHaveLength(2);
  });

  it("reports created and removed charts and stops after unsubscribe", () => {
    const { store, events, unsubscribe } = setup();
    apply(store, [
      { op: "setChart", sheet: "other", chart: chart("extra", range("data", 0, 1, 1, 1)) },
    ]);
    expect(events.at(-1)?.charts).toEqual([{ sheet: "other", id: "extra" }]);

    apply(store, [{ op: "removeChart", sheet: "other", id: "extra" }]);
    expect(events.at(-1)?.charts).toEqual([{ sheet: "other", id: "extra" }]);
    expect(resolveChartView(store, "other", "extra")).toBeNull();

    unsubscribe();
    apply(store, [set("data", 0, 1, 5)]);
    expect(events).toHaveLength(2);
  });
});

describe("resolveChartView", () => {
  it("resolves values, categories and number formats as plain data", () => {
    const { store } = setup();
    apply(store, [
      set("data", 1, 1, "n/a"),
      { op: "setRangeStyle", range: range("data", 0, 1, 0, 1), style: { numberFormat: "0.0%" } },
      {
        op: "setColumn",
        sheet: "data",
        col: 0,
        patch: { numberFormat: "@", numberLocale: "de-DE" },
      },
      {
        op: "setColumn",
        sheet: "data",
        col: 1,
        patch: { numberFormat: "#,##0", numberLocale: "fr-FR" },
      },
    ]);

    const view = resolveChartView(store, "data", "sales");
    expect(view?.series).toEqual([
      {
        name: "Series 1",
        values: [10, null],
        categories: ["Q1", "Q2"],
        // The cell style wins over the column format, as in the painted grid.
        numberFormats: ["0.0%", "#,##0"],
        categoryFormats: ["@", "@"],
        numberLocale: "fr-FR",
        truncated: false,
        referenceError: false,
      },
    ]);
  });

  it("drops points past the limit in row-major order", () => {
    const rows = MAX_CHART_POINTS / 2 + 1;
    const store = new SheetwriteStore(workbook(rows));
    stores.push(store);
    apply(store, [
      set("data", rows - 2, 1, 4),
      set("data", rows - 1, 0, 5),
      { op: "setChart", sheet: "data", chart: chart("wide", range("data", 0, 0, rows - 1, 1)) },
    ]);

    const series = resolveChartView(store, "data", "wide")?.series[0];
    expect(series?.values).toHaveLength(MAX_CHART_POINTS);
    expect(series?.values.at(-1)).toBe(4);
    expect(series?.truncated).toBe(true);
  });
});
