import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import {
  initSheetwrite,
  isSheetwriteError,
  openChartViews,
  SheetwriteStore,
  setChartViewProviderFactory,
} from "@sheetwrite/core";

import { chartWorkbook, SALES, setCell } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const stores: SheetwriteStore[] = [];

afterEach(() => {
  setChartViewProviderFactory(null);

  for (const store of stores.splice(0)) store.dispose();
});

function openFailure(store: SheetwriteStore): unknown {
  try {
    openChartViews(store).dispose();
  } catch (error) {
    return error;
  }

  return null;
}

describe("charts package registration", () => {
  it("reports a missing chart backend as a typed failure until registration", async () => {
    const store = new SheetwriteStore(chartWorkbook());
    stores.push(store);
    setChartViewProviderFactory(null);

    // Dynamic import is the behavior under test: loading the root must not register.
    await import("../src/index.js");
    const failure = openFailure(store);

    expect(isSheetwriteError(failure)).toBe(true);
    expect(failure).toMatchObject({
      code: "optional-backend-unavailable",
      operation: "chart-view",
      context: { backend: "charts" },
      retryable: false,
    });
  });

  it("opens live chart views after registration", async () => {
    const store = new SheetwriteStore(chartWorkbook());
    stores.push(store);

    // Dynamic, like above: a static import would load the root before the first test runs.
    const charts = await import("../src/index.js");

    charts.registerChartsBackend();
    setCell(store, 0, 0, 4);
    const views = openChartViews(store);

    try {
      expect(views.get(SALES)?.series[0]?.values).toEqual([4, null, null]);
    } finally {
      views.dispose();
    }
  });
});
