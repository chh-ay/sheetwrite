import { expect, it } from "bun:test";

import { createGrid, initSheetwrite } from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";

import { chartsAddon } from "../src/index.js";
import { chartWorkbook } from "./fixtures.js";

const MAX_TASKS = 50;

it("draws the charts of a grid created after install once the drawing code loads", async () => {
  await initSheetwrite({ addons: [chartsAddon()] });
  const restoreCanvas = installCanvasTestStubs();
  const host = document.body.appendChild(document.createElement("div"));
  const grid = createGrid(host, {
    workbook: chartWorkbook(),
    config: { toolbar: false, find: false, contextMenu: false },
  });

  try {
    // The drawing code loads asynchronously, so check after each task.
    let chart: Element | null = null;
    for (let task = 0; task < MAX_TASKS && !chart; task++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      chart = host.querySelector(".sheetwrite-chart");
    }
    expect(chart?.getAttribute("role")).toBe("img");
    expect(host.querySelector(".sheetwrite-object-fallback")).toBeNull();
  } finally {
    grid.destroy();
    host.remove();
    restoreCanvas();
  }
});
