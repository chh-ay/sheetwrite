import "./dom-setup.js";

import assert from "node:assert/strict";
import { cpus } from "node:os";

import * as formulas from "@sheetwrite/formulas";

import { createGrid, initSheetwrite, type Column, type PivotDefinition } from "../../packages/core/src/index.js";
import { insertChart } from "../../packages/core/src/panels/panel-controller.js";
import { pivotPanel } from "../../packages/core/src/panels/pivot-panel.js";
import { storeEngine } from "../../packages/core/src/store/engine-registry.js";
import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import { optionValue } from "./cli-options.js";
import { forceGc, summarize } from "./stats.js";

const SOURCE_ROWS = 100_000;
const GROUP_COUNT = 32;
const WARMUP = 5;
const SAMPLES = 30;
const SHEET = "source";
const SOURCE_START = 100;
const ROW_COUNT = SOURCE_START + SOURCE_ROWS + 2;
const output = optionValue(process.argv.slice(2), "--output");
if (!output) throw new Error("Pass --output <path> for panel benchmark evidence");

await initSheetwrite(undefined, formulas);
const restoreCanvas = installCanvasTestStubs();
const host = document.createElement("div");
Object.defineProperties(host, { clientWidth: { value: 900 }, clientHeight: { value: 500 } });
document.body.appendChild(host);

const groups = Array.from({ length: GROUP_COUNT }, (_, index) => `Group ${index}`);
const labels = Array.from({ length: ROW_COUNT }, (_, row) =>
  row === SOURCE_START ? "Region" : groups[row % GROUP_COUNT] ?? "",
);
const amounts = Array.from({ length: ROW_COUNT }, (_, row) => row === SOURCE_START ? "Amount" : row);
const columns: Column[] = [
  { key: "region", header: "Region", width: 100, type: "text" },
  { key: "amount", header: "Amount", width: 100, type: "number" },
  { key: "output", header: "Output", width: 100, type: "text" },
];
const range = {
  sheet: SHEET,
  start: { row: SOURCE_START, col: 0 },
  end: { row: SOURCE_START + SOURCE_ROWS, col: 1 },
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
const grid = createGrid(host, {
  workbook: {
    activeSheet: SHEET,
    sheets: [{ id: SHEET, name: "Source", rowCount: ROW_COUNT, columns }],
  },
  data: { rowCount: ROW_COUNT, columns: { region: labels, amount: amounts } },
  config: { toolbar: false, find: false, contextMenu: false },
});

/** Keep cleanup and result checks outside each timed panel operation. */
function measure(run: () => () => void): number[] {
  const samples: number[] = [];
  for (let index = 0; index < WARMUP + SAMPLES; index++) {
    const start = performance.now();
    const cleanup = run();
    const elapsed = performance.now() - start;
    cleanup();
    if (index >= WARMUP) samples.push(elapsed);
  }

  return samples;
}

try {
  assert.equal(grid.setPivot(pivot, SHEET).status, "applied");
  const body = document.createElement("div");
  const pivotMs = measure(() => {
    const cleanup = pivotPanel(grid, SHEET, pivot.id).render(body);
    return () => {
      assert.equal(body.querySelectorAll('.sheetwrite-panel-filter input[type="checkbox"]').length, GROUP_COUNT);
      cleanup();
      body.replaceChildren();
    };
  });

  grid.setSelection({ kind: "range", range });
  const chartMs = measure(() => {
    assert.equal(insertChart(grid), true);
    return () => {
      const chart = grid.getCharts(SHEET)[0];
      assert.ok(chart);
      assert.equal(chart.series.length, 1);
      assert.deepEqual(chart.series[0]?.categories, { ...range, start: { row: SOURCE_START + 1, col: 0 }, end: { row: range.end.row, col: 0 } });
      grid.openPanel(null);
      assert.equal(grid.removeChart(chart.id, SHEET).status, "applied");
    };
  });

  forceGc();
  const engine = storeEngine(grid.store);
  assert.ok(engine);
  const resources = engine.getRuntimeResourceSnapshot("snapshot", "settled");
  await Bun.write(output, JSON.stringify({
    protocol: "sheetwrite-panel-read-v1",
    platform: process.platform,
    cpu: cpus()[0]?.model,
    rows: SOURCE_ROWS,
    groups: GROUP_COUNT,
    warmup: WARMUP,
    samples: SAMPLES,
    pivot: { ...summarize(pivotMs), samplesMs: pivotMs },
    chart: { ...summarize(chartMs), samplesMs: chartMs },
    memory: process.memoryUsage(),
    maxRss: process.resourceUsage().maxRSS,
    resources,
  }, null, 2));
} finally {
  grid.destroy();
  host.remove();
  restoreCanvas();
}
