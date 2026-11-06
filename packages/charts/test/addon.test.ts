import { afterEach, describe, expect, it } from "bun:test";

import {
  createGrid,
  initSheetwrite,
  isSheetwriteError,
  openChartViews,
  SheetwriteStore,
} from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";

import { charts } from "../src/index.js";
import { chartWorkbook, SALES, setCell } from "./fixtures.js";

const stores: SheetwriteStore[] = [];

afterEach(() => {
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
    await initSheetwrite({ addons: [charts()] });
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

  it("draws the charts of a grid created after install", async () => {
    await initSheetwrite({ addons: [charts()] });
    const restoreCanvas = installCanvasTestStubs();
    const host = document.createElement("div");
    document.body.append(host);
    const grid = createGrid(host, {
      workbook: chartWorkbook(),
      config: { toolbar: false, find: false, contextMenu: false },
    });

    try {
      expect(host.querySelector(".sheetwrite-chart")?.getAttribute("role")).toBe("img");
      expect(host.querySelector(".sheetwrite-object-fallback")).toBeNull();
    } finally {
      grid.destroy();
      host.remove();
      restoreCanvas();
    }
  });
});
