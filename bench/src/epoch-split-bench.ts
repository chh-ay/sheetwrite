/**
 * Edit-to-paint cost for changes that may or may not reach the painted window.
 * Each line reports timing plus window reads, view-row mappings and aria
 * mutations, so a skipped refresh is visible beyond timing noise. Visible and
 * formula-dependent edits assert the updated aria text.
 *
 * Run from bench/: `bun run src/epoch-split-bench.ts [--scenario <id>]`.
 */
import "./dom-setup.js";
import { readFileSync } from "node:fs";

import { GeometryLayoutController } from "../../packages/core/src/geometry-layout-controller.js";
import {
  createGrid,
  initSheetwrite,
  SheetwriteStore,
  type Workbook,
  type CellValue,
  type DocumentOp,
} from "../../packages/core/src/index.js";
import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import { optionValue } from "./cli-options.js";
import { collect, summarize } from "./stats.js";

const ROWS = 100_000;
const NOTES = 10_000;
const WIDTH = 1_200;
const HEIGHT = 800;
const WARMUPS = 10;
const SAMPLES = 40;
const OFFSCREEN_ROW = ROWS - 1;
const BATCH_PATCHES = 10_000;
const BATCH_START_ROW = ROWS - BATCH_PATCHES;
const SCENARIOS = [
  "search-offscreen",
  "notes-offscreen",
  "other-sheet",
  "onscreen",
  "formula-offscreen",
  "batch-offscreen",
  "search-formula-offscreen",
];
// One scenario per process keeps JIT warmth from earlier scenarios out of the result.
const scenario = optionValue(process.argv, "--scenario");
const selectedScenarios = scenario === undefined ? SCENARIOS : [scenario];
const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
await initSheetwrite(readFileSync(WASM_PATH));
const restoreCanvas = installCanvasTestStubs();
const originalFrame = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
  callback(performance.now());
  return 0;
}) as typeof requestAnimationFrame;

try {
  for (const scenario of selectedScenarios) {
    if (!scenario || !SCENARIOS.includes(scenario)) throw new Error(`Unknown scenario ${scenario}`);
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: WIDTH, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: HEIGHT, configurable: true });
    document.body.appendChild(host);
    const workbook: Workbook = {
      activeSheet: "s1",
      sheets: Array.from({ length: 4 }, (_, index) => ({
        id: `s${index + 1}`,
        name: `Sheet ${index + 1}`,
        rowCount: ROWS,
        columns: [
          { key: "text", header: "Text", type: "text", width: 100 },
          { key: "number", header: "Number", type: "number", width: 100 },
        ],
        notes:
          scenario === "notes-offscreen" && index === 0
            ? Array.from({ length: NOTES }, (_, row) => ({
                addr: { sheet: "s1", row, col: 0 },
                text: `Note ${row}`,
              }))
            : [],
      })),
    };
    const text: Array<string | CellValue> = Array.from(
      { length: ROWS },
      (_, row) => `match ${row}`,
    );
    if (scenario === "formula-offscreen" || scenario === "search-formula-offscreen") {
      text[0] = { kind: "formula", src: `=B${ROWS}` };
    }
    const grid = createGrid(host, {
      workbook,
      data: { rowCount: ROWS, columns: { text, number: new Float64Array(ROWS) } },
      config: { toolbar: false, find: false, contextMenu: false },
    });
    if (scenario === "search-offscreen" || scenario === "search-formula-offscreen") {
      grid.search("match");
    }
    let windowReads = 0;
    let windowBytes = 0;
    let viewRowMappings = 0;
    let ariaMutations = 0;
    let peakRssBytes = process.memoryUsage().rss;
    const mapRow = GeometryLayoutController.prototype.toViewRow;
    GeometryLayoutController.prototype.toViewRow = function (row) {
      viewRowMappings += 1;
      return mapRow.call(this, row);
    };
    const mirror = host.querySelector(".sheetwrite-aria");
    if (!mirror) throw new Error("Missing aria mirror");
    const observer = new MutationObserver(() => {});
    observer.observe(mirror, { childList: true, attributes: true, subtree: true });
    const readWindow = grid.store.getVisibleWindow.bind(grid.store);
    grid.store.getVisibleWindow = (...args) => {
      windowReads += 1;
      const view = readWindow(...args);
      windowBytes += view.ffiOutputBytes ?? 0;
      return view;
    };
    let searchScans = 0;
    const scanSearch = SheetwriteStore.prototype.searchCellsFlat;
    SheetwriteStore.prototype.searchCellsFlat = function (...args: Parameters<typeof scanSearch>) {
      searchScans += 1;
      return scanSearch.apply(this, args);
    };
    let nextValue = 0;
    let patches: DocumentOp[] = [];
    const samples = collect(
      () => {
        const result = grid.applyRemoteOperations(patches);
        if (result.status !== "applied") throw new Error(`Edit failed: ${result.status}`);
      },
      {
        warmup: WARMUPS,
        iters: SAMPLES,
        // Patch construction stays untimed so the samples cover apply plus render only.
        before: () => {
          nextValue += 1;
          const value = { kind: "literal" as const, value: nextValue };
          patches =
            scenario === "batch-offscreen"
              ? Array.from({ length: BATCH_PATCHES }, (_, offset) => ({
                  op: "set" as const,
                  addr: { sheet: "s1", row: BATCH_START_ROW + offset, col: 1 },
                  value,
                }))
              : [
                  {
                    op: "set",
                    addr: {
                      sheet: scenario === "other-sheet" ? "s2" : "s1",
                      row: scenario === "onscreen" ? 0 : OFFSCREEN_ROW,
                      col: 1,
                    },
                    value,
                  },
                ];
        },
        after: () => {
          ariaMutations += observer.takeRecords().length;
          peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
        },
      },
    );
    process.stdout.write(
      `${JSON.stringify({ scenario, timing: summarize(samples), windowReadsPerEdit: windowReads / (SAMPLES + WARMUPS), windowBytesPerEdit: windowBytes / (SAMPLES + WARMUPS), viewRowMappingsPerEdit: viewRowMappings / (SAMPLES + WARMUPS), ariaMutationsPerEdit: ariaMutations / (SAMPLES + WARMUPS), searchScansPerEdit: searchScans / (SAMPLES + WARMUPS), peakRssBytes, samples })}\n`,
    );
    if (scenario === "onscreen" || scenario === "formula-offscreen") {
      const col = scenario === "onscreen" ? 1 : 0;
      const visibleCell = mirror.querySelector(`[role="gridcell"][id$="-0-${col}"]`);
      if (visibleCell?.textContent !== String(nextValue)) {
        throw new Error(`${scenario}: visible aria value did not update`);
      }
    }
    observer.disconnect();
    SheetwriteStore.prototype.searchCellsFlat = scanSearch;
    GeometryLayoutController.prototype.toViewRow = mapRow;
    grid.destroy();
    host.remove();
  }
} finally {
  globalThis.requestAnimationFrame = originalFrame;
  restoreCanvas();
}
