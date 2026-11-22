// Saved-query refresh: a CSV source of 100,000 rows and four columns (text,
// number, date, text) refreshed into its output table, which already holds the
// previous result. Each sample is one `QuerySession.refresh`: fetch, parse,
// execute, lay out the block and commit it. The run checks the table's last
// row after every sample, so a refresh that writes the wrong cells fails.
//
//   bun bench/src/query-refresh-bench.ts [--rows 100000] [--output <path>]
// Prints one JSON line: median and p95 in milliseconds, and the raw samples.

import "./dom-setup.js";
import { writeFileSync } from "node:fs";

import { createGrid, initSheetwrite } from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";

import { queriesAddon, querySessionOf } from "../../packages/queries/src/node.js";
import { optionValue } from "./cli-options.js";
import { summarize } from "./stats.js";

const args = process.argv.slice(2);
const ROWS = Number(optionValue(args, "--rows") ?? 100_000);
const OUTPUT = optionValue(args, "--output");
const WARMUP = 2;
const SAMPLES = 9;
const REGIONS = ["North", "South", "East", "West", "Northeast", "Central"];
const CUSTOMERS = 5_000;
const SHEET = "data";

let csv = "Region,Total,Day,Customer\n";
for (let row = 0; row < ROWS; row += 1) {
  const total = ((row * 7_919) % 100_000) / 100;
  csv += `${REGIONS[row % REGIONS.length]},${total},2024-0${1 + (row % 9)}-1${row % 10},Customer ${row % CUSTOMERS}\n`;
}
const bytes = new TextEncoder().encode(csv);

installCanvasTestStubs();
await initSheetwrite();
const host = document.body.appendChild(document.createElement("div"));
const columns = Array.from({ length: 6 }, (_, col) => ({
  key: `c${col}`,
  header: `C${col}`,
  width: 80,
  type: "text" as const,
}));
const grid = createGrid(host, {
  workbook: { activeSheet: SHEET, sheets: [{ id: SHEET, name: "Data", rowCount: 8, columns }] },
});
queriesAddon().grid?.({
  grid,
  settings: { fetchSource: async () => ({ kind: "bytes", bytes }) },
  queryCommands: () => () => {},
  historyCommand: () => {},
  formulaSuggestions: () => () => {},
});
const session = await querySessionOf(grid);
const defined = session.define({
  id: "sales",
  name: "Sales",
  source: {
    kind: "csv",
    sourceId: "sales-feed",
    locator: "https://example.test/sales.csv",
    columns: [
      { id: "region", name: "Region", type: "text" },
      { id: "total", name: "Total", type: "number" },
      { id: "day", name: "Day", type: "date" },
      { id: "customer", name: "Customer", type: "text" },
    ],
  },
  steps: [],
  output: { table: "sales-table", tableName: "Sales", anchor: { sheet: SHEET, row: 0, col: 0 } },
});
if (defined.status !== "applied") throw new Error(`The query was not defined: ${defined.status}`);

const samples_ms: number[] = [];
for (let sample = 0; sample < WARMUP + SAMPLES; sample += 1) {
  const started = performance.now();
  const result = await session.refresh("sales");
  const elapsed = performance.now() - started;
  if (result.status !== "applied" || result.transaction.status !== "applied") {
    throw new Error(`Refresh ${sample} was not applied: ${result.status}`);
  }
  const last = grid.store.getCell({ sheet: SHEET, row: ROWS, col: 3 }).resolved;
  if (last !== `Customer ${(ROWS - 1) % CUSTOMERS}`) {
    throw new Error(`Refresh ${sample} left ${String(last)} in the last row`);
  }
  if (sample >= WARMUP) samples_ms.push(elapsed);
}
grid.destroy();

const timing = summarize(samples_ms);
const report = { rows: ROWS, median: timing.median, p95: timing.p95, samplesMs: samples_ms };
if (OUTPUT) writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report)}\n`);
