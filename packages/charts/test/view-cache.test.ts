import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import type { ChartRef } from "@sheetwrite/core";
import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";

import { type ChartChangeEvent, type ChartViewCache, createChartViewCache } from "../src/index.js";
import { chartWorkbook, SALES, setCell } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const LATER: ChartRef = { sheet: "s", id: "later" };
const stores: SheetwriteStore[] = [];
const caches: ChartViewCache[] = [];

afterEach(() => {
  for (const cache of caches.splice(0)) cache.dispose();
  for (const store of stores.splice(0)) store.dispose();
});

describe("chart view cache", () => {
  it("keeps a view across unrelated edits and refreshes it before notifying source edits", () => {
    const store = new SheetwriteStore(chartWorkbook());
    const charts = createChartViewCache(store);
    stores.push(store);
    caches.push(charts);
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
  });

  it("replaces a cached miss when the chart is added and a cached view when its sheet is removed", () => {
    const store = new SheetwriteStore(chartWorkbook());
    const charts = createChartViewCache(store);
    stores.push(store);
    caches.push(charts);

    expect(charts.get(LATER)).toBeNull();
    const addition = store.applyTransaction({
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
    expect(addition.status).toBe("applied");
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
  });

  it("stops observing the store once disposed", () => {
    const store = new SheetwriteStore(chartWorkbook());
    const charts = createChartViewCache(store);
    stores.push(store);
    caches.push(charts);
    const events: ChartChangeEvent[] = [];
    charts.subscribe((event) => events.push(event));
    charts.get(SALES);

    charts.dispose();
    setCell(store, 0, 0, 3);

    expect(events).toEqual([]);
    expect(() => charts.get(SALES)).toThrow("chart view cache was disposed");
  });
});
