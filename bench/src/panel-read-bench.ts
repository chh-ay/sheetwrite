// Panel reads of a large source range: the pivot field list (distinct values
// of a filter field), dashboard slicer values, a dashboard pivot's output and
// Insert › Chart (category and header inference), and single cell edits with
// the pivot field list closed and open. The output records each result so two
// runs can be compared for equality.

import "./dom-setup.js";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { cpus, hostname } from "node:os";

import * as formulas from "@sheetwrite/formulas";

import {
  pivotOutputOf,
  slicerValuesOf,
} from "../../packages/core/src/dashboard/dashboard-engine.js";
import {
  type CellAddress,
  createGrid,
  initSheetwrite,
  type Column,
  type DashboardSlicerItem,
  type PivotDefinition,
} from "../../packages/core/src/index.js";
import { insertChart } from "../../packages/core/src/panels/panel-controller.js";
import { pivotPanel } from "../../packages/core/src/panels/pivot-panel.js";
import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import { requiredOption } from "./cli-options.js";
import { summarize } from "./stats.js";

const SOURCE_ROWS = 100_000;
const GROUP_COUNT = 32;
const WARMUPS = 5;
const SAMPLES = 30;
const REPORT_SHEET = "report";
const SHEET = "source";
/** A sheet the pivot does not read, for edits that cannot change its field list. */
const OTHER_SHEET = "other";
const HOST_WIDTH_PX = 900;
const HOST_HEIGHT_PX = 500;
const COLUMN_WIDTH_PX = 100;
const ROW_COUNT = SOURCE_ROWS + 1;

const output = requiredOption(process.argv.slice(2), "--output");

await initSheetwrite({ engine: formulas });
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
const otherColumn: Column = { key: "note", header: "Note", width: COLUMN_WIDTH_PX, type: "number" };
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
/** One output row per source row: the largest output a dashboard pivot reads. */
const outputPivot: PivotDefinition = {
  id: "output-pivot",
  name: "OutputPivot",
  source: { table: table.id },
  anchor: { row: 0, col: 0 },
  rows: [1],
  columns: [],
  values: [{ field: 0, aggregation: "COUNT" }],
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
    sheets: [
      { id: SHEET, name: "Source", rowCount: ROW_COUNT, columns, tables: [table] },
      { id: REPORT_SHEET, name: "Report", kind: "dashboard", rowCount: 0, columns: [] },
      { id: OTHER_SHEET, name: "Other", rowCount: 1, columns: [otherColumn] },
    ],
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

/**
 * One cell write per sample to `addr`, each a new number, so no write is a
 * no-op. The source cell holds numbers already, so its field type stays.
 */
function editEach(addr: CellAddress): () => () => void {
  let value = 0;
  return () => {
    value += 1;
    const result = grid.applyTransaction({
      patches: [{ op: "set", addr, value: { kind: "literal", value } }],
    });
    if (result.status !== "applied") throw new Error(`edit of ${addr.sheet} was ${result.status}`);
    return () => {};
  };
}

/**
 * Cell edits with the pivot field list closed and open: on another sheet,
 * which cannot change the list, and in the source, which re-reads it. The
 * open list must stay the same elements throughout.
 */
function measureOpenPanelEdits(body: HTMLElement): Record<string, number[]> {
  const other = { sheet: OTHER_SHEET, row: 0, col: 0 };
  const source = { sheet: SHEET, row: 1, col: 1 };
  const otherSheetEditMs = measure(editEach(other));
  const sourceEditMs = measure(editEach(source));
  const cleanup = pivotPanel(grid, SHEET, pivot.id, false).render(body);
  let openPanelOtherSheetEditMs: number[];
  let openPanelSourceEditMs: number[];
  try {
    const list = body.querySelector(".sheetwrite-panel-fields");
    if (list === null) throw new Error("the pivot field list is missing");
    openPanelOtherSheetEditMs = measure(editEach(other));
    openPanelSourceEditMs = measure(editEach(source));
    if (body.querySelector(".sheetwrite-panel-fields") !== list) {
      throw new Error("a cell edit rebuilt the open pivot field list");
    }
  } finally {
    cleanup?.();
    body.replaceChildren();
  }
  const restored = grid.applyTransaction({
    patches: [
      { op: "set", addr: source, value: { kind: "literal", value: amounts[1] ?? null } },
      { op: "set", addr: other, value: { kind: "literal", value: null } },
    ],
  });
  if (restored.status !== "applied") throw new Error("edited cells were not restored");
  return { otherSheetEditMs, sourceEditMs, openPanelOtherSheetEditMs, openPanelSourceEditMs };
}

try {
  if (grid.setPivot(pivot, SHEET).status !== "applied") throw new Error("pivot was not applied");
  if (grid.setPivot(outputPivot, REPORT_SHEET).status !== "applied") {
    throw new Error("output pivot was not applied");
  }

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
  const openPanelEdits = measureOpenPanelEdits(body);

  let slicerValues = "";
  const slicerMs = measure(() => {
    const values = slicerValuesOf(grid.store, slicer);
    return () => {
      slicerValues = JSON.stringify(values);
    };
  });

  let pivotOutputDigest = "";
  const pivotOutputMs = measure(() => {
    const read = pivotOutputOf(grid.store, REPORT_SHEET, 0);
    if (read === null) throw new Error("dashboard pivot output is missing");
    return () => {
      const text = JSON.stringify(read);
      pivotOutputDigest = createHash("sha256").update(text).digest("hex");
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
        results: { pivotPanelDigest, slicerValues, pivotOutputDigest, chartDefinition },
        pivotPanelMs: summarize(pivotMs),
        slicerValuesMs: summarize(slicerMs),
        pivotOutputMs: summarize(pivotOutputMs),
        insertChartMs: summarize(chartMs),
        cellEditMs: Object.fromEntries(
          Object.entries(openPanelEdits).map(([row, samples]) => [row, summarize(samples)]),
        ),
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
