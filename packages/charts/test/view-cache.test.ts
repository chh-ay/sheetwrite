import { beforeAll, describe, expect, it } from "bun:test";

import type { ChartRef, Workbook } from "@sheetwrite/core";
import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";

import { type ChartChangeEvent, createChartViewCache } from "../src/index.js";

beforeAll(async () => {
  await initSheetwrite();
});

const SALES: ChartRef = { sheet: "s", id: "sales" };
const LATER: ChartRef = { sheet: "s", id: "later" };

function chartWorkbook(): Workbook {
  return {
    activeSheet: "s",
    sheets: [
      {
        id: "s",
        name: "Sales",
        rowCount: 3,
        columns: [
          { key: "amount", header: "Amount", width: 80, type: "number" },
          { key: "note", header: "Note", width: 80, type: "text" },
        ],
        charts: [
          {
            id: "sales",
            kind: "column",
            anchor: { row: 0, col: 1, offsetX: 0, offsetY: 0, width: 320, height: 200 },
            series: [
              {
                name: "Amount",
                values: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 2, col: 0 } },
              },
            ],
          },
        ],
      },
    ],
  };
}

function setCell(store: SheetwriteStore, row: number, col: number, value: number | string): void {
  store.applyTransaction({
    patches: [{ op: "set", addr: { sheet: "s", row, col }, value: { kind: "literal", value } }],
  });
}

describe("chart view cache", () => {
  it("keeps a view across unrelated edits and refreshes it before notifying source edits", () => {
    const store = new SheetwriteStore(chartWorkbook());
    const charts = createChartViewCache(store);
    const events: ChartChangeEvent[] = [];
    const valuesSeenByListener: Array<Array<number | null> | undefined> = [];
    charts.subscribe((event) => {
      events.push(event);
      valuesSeenByListener.push(charts.get(SALES)?.series[0]?.values);
    });

    const initial = charts.get(SALES);
    expect(initial?.series[0]?.values).toEqual([null, null, null]);

    setCell(store, 0, 1, "outside the series");
    expect(events).toEqual([]);
    expect(charts.get(SALES)).toBe(initial);

    setCell(store, 1, 0, 7);
    expect(events.map((event) => event.charts)).toEqual([[SALES]]);
    expect(valuesSeenByListener).toEqual([[null, 7, null]]);
    expect(charts.get(SALES)?.series[0]?.values).toEqual([null, 7, null]);

    charts.dispose();
    store.dispose();
  });

  it("replaces a cached miss when the chart is added and a cached view when its sheet is removed", () => {
    const store = new SheetwriteStore(chartWorkbook());
    const charts = createChartViewCache(store);

    expect(charts.get(LATER)).toBeNull();
    store.applyTransaction({
      patches: [
        {
          op: "setChart",
          sheet: "s",
          chart: {
            id: "later",
            kind: "line",
            anchor: { row: 2, col: 1, offsetX: 0, offsetY: 0, width: 320, height: 200 },
            series: [
              { values: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } } },
            ],
          },
        },
      ],
    });
    expect(charts.get(LATER)?.chart.kind).toBe("line");

    expect(charts.get(SALES)).not.toBeNull();
    const removal = store.applyTransaction({
      patches: [
        {
          op: "addSheet",
          sheet: {
            id: "t",
            name: "Other",
            order: 1,
            rowCount: 1,
            columns: [{ key: "x", header: "X", width: 80, type: "text" }],
            cells: [],
          },
        },
        { op: "removeSheet", sheet: "s" },
      ],
    });
    expect(removal.status).toBe("applied");
    expect(charts.get(SALES)).toBeNull();
    expect(charts.get(LATER)).toBeNull();

    charts.dispose();
    store.dispose();
  });

  it("stops observing the store once disposed", () => {
    const store = new SheetwriteStore(chartWorkbook());
    const charts = createChartViewCache(store);
    const events: ChartChangeEvent[] = [];
    charts.subscribe((event) => events.push(event));
    charts.get(SALES);

    charts.dispose();
    setCell(store, 0, 0, 3);

    expect(events).toEqual([]);
    expect(() => charts.get(SALES)).toThrow("chart view cache was disposed");
    store.dispose();
  });
});
