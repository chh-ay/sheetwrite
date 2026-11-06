// Panel reads of a large source range: the pivot field list (distinct values
// of a filter field), dashboard slicer values and Insert › Chart (category and
// header inference). The output records each result so two runs can be
// compared for equality.

import "./dom-setup.js";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { cpus, hostname } from "node:os";

import * as formulas from "@sheetwrite/formulas";

import {
  createGrid,
  initSheetwrite,
  type Column,
  type DashboardSlicerItem,
  type PivotDefinition,
} from "../../packages/core/src/index.js";
import { slicerValuesOf } from "../../packages/core/src/dashboard/dashboard-engine.js";
import { insertChart } from "../../packages/core/src/panels/panel-controller.js";
import { pivotPanel } from "../../packages/core/src/panels/pivot-panel.js";
import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import { requiredOption } from "./cli-options.js";
import { summarize } from "./stats.js";

const SOURCE_ROWS = 100_000;
const GROUP_COUNT = 32;
const WARMUPS = 5;
const SAMPLES = 30;
const SHEET = "source";
const HOST_WIDTH_PX = 900;
const HOST_HEIGHT_PX = 500;
const COLUMN_WIDTH_PX = 100;
const ROW_COUNT = SOURCE_ROWS + 1;

const output = requiredOption(process.argv.slice(2), "--output");

await initSheetwrite(undefined, formulas);
const restoreCanvas = installCanvasTestStubs();
const host = document.createElement("div");
Object.defineProperties(host, {
  clientWidth: { value: HOST_WIDTH_PX },
  clientHeight: { value: HOST_HEIGHT_PX },
});
document.body.appendChild(host);

const groups = Array.from({ length: GROUP_COUNT }, (_, index) => `Group ${index}`);
const labels = Array.from({ length: ROW_COUNT }, (_, row) =>
  row === 0 ? "Region" : (groups[row % GROUP_COUNT] ?? ""),
);
const amounts = Array.from({ length: ROW_COUNT }, (_, row) => (row === 0 ? "Amount" : row));
const columns: Column[] = [
  { key: "region", header: "Region", width: COLUMN_WIDTH_PX, type: "text" },
  { key: "amount", header: "Amount", width: COLUMN_WIDTH_PX, type: "number" },
  { key: "output", header: "Output", width: COLUMN_WIDTH_PX, type: "text" },
];
const range = {
  sheet: SHEET,
  start: { row: 0, col: 0 },
  end: { row: SOURCE_ROWS, col: 1 },
};
const pivot: PivotDefinition = {
  id: "panel-pivot",
  name: "PanelPivot",
  source: { range },
  anchor: { row: 0, col: 2 },
  rows: [],
  columns: [],
  values: [],
  filters: [{ field: 0, values: groups }],
};
const table = {
  id: "panel-table",
  name: "PanelTable",
  range,
  columns: [
    { id: "region", name: "Region" },
    { id: "amount", name: "Amount" },
  ],
  headerRow: true,
  totalsRow: false,
};
const slicer: DashboardSlicerItem = {
  id: "panel-slicer",
  box: { x: 0, y: 0, w: 2, h: 4 },
  kind: "slicer",
  field: { table: table.id, column: "region" },
};
const grid = createGrid(host, {
  workbook: {
    activeSheet: SHEET,
    sheets: [{ id: SHEET, name: "Source", rowCount: ROW_COUNT, columns, tables: [table] }],
  },
  data: { rowCount: ROW_COUNT, columns: { region: labels, amount: amounts } },
  config: { toolbar: false, find: false, contextMenu: false },
});

/** Time `run` only; the cleanup it returns runs outside the measurement. */
function measure(run: () => () => void): number[] {
  const samples: number[] = [];
  for (let index = 0; index < WARMUPS + SAMPLES; index++) {
    const start = performance.now();
    const cleanup = run();
    const elapsed = performance.now() - start;
    cleanup();
    if (index >= WARMUPS) samples.push(elapsed);
  }

  return samples;
}

try {
  if (grid.setPivot(pivot, SHEET).status !== "applied") throw new Error("pivot was not applied");

  const body = document.createElement("div");
  let pivotPanelDigest = "";
  const pivotMs = measure(() => {
    const cleanup = pivotPanel(grid, SHEET, pivot.id, false).render(body);
    return () => {
      pivotPanelDigest = createHash("sha256").update(body.innerHTML).digest("hex");
      cleanup?.();
      body.replaceChildren();
    };
  });

  let slicerValues = "";
  const slicerMs = measure(() => {
    const values = slicerValuesOf(grid.store, slicer);
    return () => {
      slicerValues = JSON.stringify(values);
    };
  });

  grid.setSelection({ kind: "range", range });
  let chartDefinition = "";
  const chartMs = measure(() => {
    if (!insertChart(grid)) throw new Error("chart was not inserted");
    return () => {
      const chart = grid.getCharts(SHEET)[0];
      if (!chart) throw new Error("inserted chart is missing");
      chartDefinition = JSON.stringify(chart);
      grid.openPanel(null);
      if (grid.removeChart(chart.id, SHEET).status !== "applied") {
        throw new Error("chart was not removed");
      }
    };
  });

  writeFileSync(
    output,
    JSON.stringify(
      {
        protocol: "sheetwrite-panel-read-v1",
        host: hostname(),
        platform: process.platform,
        cpu: cpus()[0]?.model,
        rows: SOURCE_ROWS,
        groups: GROUP_COUNT,
        warmups: WARMUPS,
        samples: SAMPLES,
        results: { pivotPanelDigest, slicerValues, chartDefinition },
        pivotPanelMs: summarize(pivotMs),
        slicerValuesMs: summarize(slicerMs),
        insertChartMs: summarize(chartMs),
      },
      null,
      2,
    ),
  );
} finally {
  grid.destroy();
  host.remove();
  restoreCanvas();
}
