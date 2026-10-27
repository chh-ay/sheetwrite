import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import type { ChartChangeEvent, ChartRef, Workbook } from "@sheetwrite/core";
import {
  initSheetwrite,
  openChartViews,
  SheetwriteStore,
  setChartViewProviderFactory,
} from "@sheetwrite/core";

beforeAll(async () => {
  await initSheetwrite();
});

afterEach(() => {
  setChartViewProviderFactory(null);
});

const SALES: ChartRef = { sheet: "s", id: "sales" };

function chartWorkbook(): Workbook {
  return {
    activeSheet: "s",
    sheets: [
      {
        id: "s",
        name: "Sales",
        rowCount: 2,
        columns: [{ key: "amount", header: "Amount", width: 80, type: "number" }],
        charts: [
          {
            id: "sales",
            kind: "column",
            anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 320, height: 200 },
            series: [
              {
                name: "Amount",
                values: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
              },
            ],
          },
        ],
      },
    ],
  };
}

function setAmount(store: SheetwriteStore, row: number, value: number): void {
  store.applyTransaction({
    patches: [{ op: "set", addr: { sheet: "s", row, col: 0 }, value: { kind: "literal", value } }],
  });
}

describe("charts package registration", () => {
  it("lets core open live chart views only after registration", async () => {
    const store = new SheetwriteStore(chartWorkbook());
    setChartViewProviderFactory(null);
    expect(() => openChartViews(store)).toThrow();

    // Dynamic import is the behavior under test: loading the root must not register.
    const charts = await import("../src/index.js");
    expect(() => openChartViews(store)).toThrow();

    charts.registerChartsBackend();
    setAmount(store, 0, 4);
    const views = openChartViews(store);
    expect(views.get(SALES)?.series[0]?.values).toEqual([4, null]);

    const events: ChartChangeEvent[] = [];
    const valuesSeenByListener: Array<Array<number | null> | undefined> = [];
    views.subscribe((event) => {
      events.push(event);
      valuesSeenByListener.push(views.get(SALES)?.series[0]?.values);
    });
    setAmount(store, 1, 9);
    expect(events.map((event) => event.charts)).toEqual([[SALES]]);
    expect(valuesSeenByListener).toEqual([[4, 9]]);

    views.dispose();
    setAmount(store, 1, 10);
    expect(events).toHaveLength(1);
    expect(() => views.get(SALES)).toThrow("chart view cache was disposed");
    store.dispose();
  });
});
