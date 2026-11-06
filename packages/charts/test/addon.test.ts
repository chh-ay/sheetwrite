import { afterEach, describe, expect, it } from "bun:test";

import {
  createGrid,
  initSheetwrite,
  isSheetwriteError,
  openChartViews,
  SheetwriteStore,
} from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";

import { chartsAddon } from "../src/index.js";
import { chartWorkbook, SALES, setCell } from "./fixtures.js";

const stores: SheetwriteStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
});

/** Resolves with the first value `read` returns, checking after each task; the drawing code loads asynchronously. */
async function until<T>(read: () => T | null | undefined): Promise<T> {
  const MAX_TASKS = 50;
  for (let task = 0; task < MAX_TASKS; task++) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("the value did not appear");
}

function openFailure(store: SheetwriteStore): unknown {
  try {
    openChartViews(store).dispose();
  } catch (error) {
    return error;
  }

  return null;
}

describe("charts add-on", () => {
  it("reports a missing chart backend as a typed failure until the add-on is installed", async () => {
    await initSheetwrite();
    const store = new SheetwriteStore(chartWorkbook());
    stores.push(store);

    const failure = openFailure(store);

    expect(isSheetwriteError(failure)).toBe(true);
    expect(failure).toMatchObject({
      code: "optional-backend-unavailable",
      operation: "chart-view",
      context: { backend: "charts" },
      retryable: false,
    });
  });

  it("opens live chart views after initSheetwrite installs it", async () => {
    await initSheetwrite({ addons: [chartsAddon()] });
    const store = new SheetwriteStore(chartWorkbook());
    stores.push(store);

    setCell(store, 0, 0, 4);
    const views = openChartViews(store);

    try {
      expect(views.get(SALES)?.series[0]?.values).toEqual([4, null, null]);
    } finally {
      views.dispose();
    }
  });

  it("draws the charts of a grid created after install once the drawing code loads", async () => {
    await initSheetwrite({ addons: [chartsAddon()] });
    const restoreCanvas = installCanvasTestStubs();
    const host = document.createElement("div");
    document.body.append(host);
    const grid = createGrid(host, {
      workbook: chartWorkbook(),
      config: { toolbar: false, find: false, contextMenu: false },
    });

    try {
      const chart = await until(() => host.querySelector(".sheetwrite-chart"));
      expect(chart.getAttribute("role")).toBe("img");
      expect(host.querySelector(".sheetwrite-object-fallback")).toBeNull();
    } finally {
      grid.destroy();
      host.remove();
      restoreCanvas();
    }
  });
});
