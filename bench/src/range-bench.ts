import "./dom-setup.js";
import { readFileSync } from "node:fs";

import { getEngine } from "../../packages/core/src/engine.js";
import {
  createGrid,
  type DataSourcePage,
  type DataSourceRequest,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  type Range,
  SheetwriteStore,
  type Workbook,
} from "../../packages/core/src/index.js";
import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import { COLUMNS, makeColumnar, toSheetwriteColumnar } from "./dataset.js";
import {
  type BenchmarkMode,
  MATRIX_IDS,
  PERFORMANCE_GATE_PROTOCOL_VERSION,
} from "./gate-protocol.js";
import {
  type RangeGateArtifact,
  type RangeStructuralResult,
  validateRangeArtifact,
} from "./range-gate.js";
import { summarize } from "./stats.js";

const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
const SHEET = "range-bench";
const mode: BenchmarkMode = process.argv.includes("--smoke") ? "smoke" : "full";
const ROW_COUNTS = mode === "smoke" ? [10_000] : [10_000, 100_000, 1_000_000];

interface StoreAllocationStats {
  readonly documentOperations: number;
  readonly jsPatchObjects: number;
  readonly ffiCalls: number;
  readonly maxTransferredArrayLength: number;
  readonly distinctStyleIds: number;
  readonly historySnapshots: number;
  readonly historySnapshotBytes: number;
  readonly historyMaterializations: number;
  readonly historyDisposals: number;
  readonly styleDictionaryEntries: number;
}

interface StructuralObservation {
  readonly store?: StoreAllocationStats;
  readonly retainedRevisionPointsBefore?: number;
  readonly retainedRevisionRectanglesBefore?: number;
  readonly retainedRevisionPointsAfter?: number;
  readonly retainedRevisionRectanglesAfter?: number;
  readonly maxVisibleWindowCells?: number;
  readonly autoFitChunkCellLimit?: number;
  readonly visibleWindowRequests?: number;
  readonly scheduledChunks?: number;
  readonly historyBytes?: number;
  readonly ffiCalls?: number;
  readonly maxTransferredArrayLength?: number;
  readonly documentOperationCount?: number;
  readonly jsPatchObjectCount?: number;
  readonly outputSentinel?: string;
}

type InstrumentedGrid = Grid & {
  getMutationRevisionStats(): {
    points: number;
    rectangles: number;
    retainedRequests: number;
    retainedRevisions: number;
  };
  getAutoFitResourceStats(): {
    chunkCellLimit: number;
    windowRequests: number;
    maxWindowCells: number;
    scheduledChunks: number;
    completedJobs: number;
    cancelledJobs: number;
    committedPatches: number;
  };
  resetAutoFitResourceStats(): void;
};

function workbook(row_count: number): Workbook {
  return {
    activeSheet: SHEET,
    sheets: [
      {
        id: SHEET,
        name: "Range Bench",
        rowCount: row_count,
        columns: COLUMNS.map((column) => ({ ...column })),
      },
    ],
  };
}

async function profile(
  rows: number,
  workload: RangeStructuralResult["workload"],
  addressed_cells: number,
  wasm_memory: WebAssembly.Memory,
  operation: () => StructuralObservation | Promise<StructuralObservation>,
): Promise<RangeStructuralResult> {
  Bun.gc(true);
  const heap_before = process.memoryUsage().heapUsed;
  const wasm_before = wasm_memory.buffer.byteLength;
  const start = performance.now();
  const observation = await operation();
  const timing_samples_ms = [performance.now() - start];
  Bun.gc(true);
  const store = observation.store;
  return {
    rows,
    workload,
    addressedCells: addressed_cells,
    timingSamplesMs: timing_samples_ms,
    timing: summarize(timing_samples_ms),
    heapDeltaBytes: Math.max(0, process.memoryUsage().heapUsed - heap_before),
    wasmDeltaBytes: Math.max(0, wasm_memory.buffer.byteLength - wasm_before),
    documentOperationCount: observation.documentOperationCount ?? store?.documentOperations ?? 0,
    jsPatchObjectCount: observation.jsPatchObjectCount ?? store?.jsPatchObjects ?? 0,
    ffiCalls: observation.ffiCalls ?? store?.ffiCalls ?? 0,
    maxTransferredArrayLength:
      observation.maxTransferredArrayLength ?? store?.maxTransferredArrayLength ?? 0,
    retainedRevisionPointsBefore: observation.retainedRevisionPointsBefore ?? 0,
    retainedRevisionRectanglesBefore: observation.retainedRevisionRectanglesBefore ?? 0,
    retainedRevisionPointsAfter: observation.retainedRevisionPointsAfter ?? 0,
    retainedRevisionRectanglesAfter: observation.retainedRevisionRectanglesAfter ?? 0,
    maxVisibleWindowCells: observation.maxVisibleWindowCells ?? 0,
    autoFitChunkCellLimit: observation.autoFitChunkCellLimit ?? 0,
    visibleWindowRequests: observation.visibleWindowRequests ?? 0,
    scheduledChunks: observation.scheduledChunks ?? 0,
    historyBytes: observation.historyBytes ?? 0,
    outputSentinel: observation.outputSentinel ?? "",
  };
}

async function store_workloads(
  rows: number,
  wasm_memory: WebAssembly.Memory,
): Promise<RangeStructuralResult[]> {
  const store = new SheetwriteStore(workbook(rows), toSheetwriteColumnar(makeColumnar(rows)));
  const results: RangeStructuralResult[] = [];
  const whole_column: Range = {
    sheet: SHEET,
    start: { row: 0, col: 0 },
    end: { row: rows - 1, col: 0 },
  };
  store.applyTransaction({
    patches: [
      {
        op: "setRangeStyle",
        range: { ...whole_column, end: { row: Math.floor(rows / 2) - 1, col: 0 } },
        style: { italic: true },
      },
    ],
  });
  store.resetRangeMutationAllocationStats();
  results.push(
    await profile(rows, "style merge and clear", rows, wasm_memory, () => {
      store.applyTransaction({
        patches: [{ op: "setRangeStyle", range: whole_column, style: { bold: true } }],
      });
      store.applyTransaction({
        patches: [{ op: "setRangeStyle", range: whole_column, style: null }],
      });
      return { store: store.getRangeMutationAllocationStats() };
    }),
  );

  const clear_snapshot = store.captureRangeHistory(whole_column);
  if (!clear_snapshot) throw new Error("range benchmark could not capture clear history");
  store.resetRangeMutationAllocationStats();
  results.push(
    await profile(rows, "range clear", rows, wasm_memory, () => {
      store.applyTransaction({
        patches: [{ op: "clearRange", range: whole_column, contents: true, style: false }],
      });
      return {
        store: store.getRangeMutationAllocationStats(),
        historyBytes: clear_snapshot.byteLength,
      };
    }),
  );
  clear_snapshot.dispose();

  const sparse: DocumentOp = {
    op: "setRange",
    range: {
      sheet: SHEET,
      start: { row: 0, col: 0 },
      end: { row: rows - 1, col: COLUMNS.length - 1 },
    },
    cells: [
      { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "first" } },
      {
        rowOffset: Math.floor(rows / 2),
        colOffset: 2,
        value: { kind: "literal", value: "middle" },
      },
      {
        rowOffset: rows - 1,
        colOffset: COLUMNS.length - 1,
        value: { kind: "literal", value: "last" },
      },
    ],
  };
  store.resetRangeMutationAllocationStats();
  results.push(
    await profile(rows, "sparse setRange", sparse.cells.length, wasm_memory, () => {
      store.applyTransaction({ patches: [sparse] });
      return { store: store.getRangeMutationAllocationStats() };
    }),
  );

  const dense_cells = Math.min(rows, 100_000);
  const dense: DocumentOp = {
    op: "setBlock",
    range: {
      sheet: SHEET,
      start: { row: 0, col: 1 },
      end: { row: dense_cells - 1, col: 1 },
    },
    block: {
      rowCount: dense_cells,
      colCount: 1,
      values: Array.from({ length: dense_cells }, (_, index) => index + 0.5),
    },
  };
  store.resetRangeMutationAllocationStats();
  results.push(
    await profile(rows, "dense setBlock", dense_cells, wasm_memory, () => {
      store.applyTransaction({ patches: [dense] });
      return { store: store.getRangeMutationAllocationStats() };
    }),
  );

  const selected_cells = Math.min(rows, 10_000);
  results.push(
    await profile(rows, "clipboard bulk read", selected_cells, wasm_memory, () => {
      const packed = store.getClipboardWindow(SHEET, { start: 0, end: selected_cells }, [0]);
      const materialized = new Array<{ resolved: unknown; style: unknown }>(selected_cells);
      for (let index = 0; index < selected_cells; index++) {
        materialized[index] = {
          resolved: packed.values[index] ?? null,
          style: packed.styles[packed.styleIds[index] ?? 0] ?? {},
        };
      }
      return {
        ffiCalls: packed.ffiCalls,
        maxTransferredArrayLength: packed.transferredElements,
        documentOperationCount: 0,
        jsPatchObjectCount: materialized.length,
        outputSentinel: JSON.stringify([materialized[0]?.resolved, materialized.at(-1)?.resolved]),
      };
    }),
  );

  store.dispose();
  return results;
}

async function datasource_revision_workload(
  rows: number,
  wasm_memory: WebAssembly.Memory,
): Promise<RangeStructuralResult> {
  return profile(rows, "datasource revision retention", rows, wasm_memory, async () => {
    const pending = Promise.withResolvers<DataSourcePage>();
    let request: DataSourceRequest | undefined;
    const grid = createGrid(document.createElement("div"), {
      workbook: workbook(rows),
      datasource: {
        capabilities: { protocol: 2, columns: "windowed" },
        getRows: (next_request) => {
          request = next_request;
          return pending.promise;
        },
      },
    }) as InstrumentedGrid;
    if (!request) throw new Error("range benchmark datasource request was not issued");
    const store = grid.store as SheetwriteStore;
    const dense_cells = Math.min(rows, 1_000);
    const operations: DocumentOp[] = [
      {
        op: "setRange",
        range: {
          sheet: SHEET,
          start: { row: 0, col: 0 },
          end: { row: rows - 1, col: COLUMNS.length - 1 },
        },
        cells: [
          { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "first" } },
          {
            rowOffset: rows - 1,
            colOffset: COLUMNS.length - 1,
            value: { kind: "literal", value: "last" },
          },
        ],
      },
      {
        op: "setBlock",
        range: {
          sheet: SHEET,
          start: { row: 0, col: 1 },
          end: { row: dense_cells - 1, col: 1 },
        },
        block: {
          rowCount: dense_cells,
          colCount: 1,
          values: new Array(dense_cells).fill(1),
        },
      },
      {
        op: "clearRange",
        range: {
          sheet: SHEET,
          start: { row: 0, col: COLUMNS.length - 1 },
          end: { row: rows - 1, col: COLUMNS.length - 1 },
        },
        contents: true,
        style: false,
      },
    ];
    store.resetRangeMutationAllocationStats();
    store.applyTransaction({ patches: operations });
    const before = grid.getMutationRevisionStats();
    const store_stats = store.getRangeMutationAllocationStats();
    pending.resolve({ protocol: 2, start: request.start, columns: request.columns, rows: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const after = grid.getMutationRevisionStats();
    grid.destroy();
    return {
      store: store_stats,
      retainedRevisionPointsBefore: before.points,
      retainedRevisionRectanglesBefore: before.rectangles,
      retainedRevisionPointsAfter: after.points,
      retainedRevisionRectanglesAfter: after.rectangles,
    };
  });
}

async function auto_fit_workload(
  rows: number,
  wasm_memory: WebAssembly.Memory,
): Promise<RangeStructuralResult> {
  const target_columns = rows === 10_000 ? [0, 1] : [0];
  return profile(rows, "large exact auto-fit", rows * target_columns.length, wasm_memory, () => {
    const grid = createGrid(document.createElement("div"), {
      workbook: workbook(rows),
      data: toSheetwriteColumnar(makeColumnar(rows)),
    }) as InstrumentedGrid;
    const store = grid.store as SheetwriteStore;
    store.resetRangeMutationAllocationStats();
    grid.resetAutoFitResourceStats();
    grid.autoFitColumns(target_columns);
    const auto_fit = grid.getAutoFitResourceStats();
    const store_stats = store.getRangeMutationAllocationStats();
    if (auto_fit.completedJobs !== 1 || auto_fit.cancelledJobs !== 0) {
      throw new Error("range benchmark auto-fit did not complete exactly once");
    }
    grid.destroy();
    return {
      store: store_stats,
      ffiCalls: store_stats.ffiCalls + auto_fit.windowRequests,
      maxTransferredArrayLength: Math.max(
        store_stats.maxTransferredArrayLength,
        auto_fit.maxWindowCells,
      ),
      maxVisibleWindowCells: auto_fit.maxWindowCells,
      autoFitChunkCellLimit: auto_fit.chunkCellLimit,
      visibleWindowRequests: auto_fit.windowRequests,
      scheduledChunks: auto_fit.scheduledChunks,
    };
  });
}

const bytes = readFileSync(WASM_PATH);
await initSheetwrite({ source: bytes });
const memory = getEngine().getMemory();
const restore_canvas = installCanvasTestStubs();
const original_request_animation_frame = globalThis.requestAnimationFrame;
const original_cancel_animation_frame = globalThis.cancelAnimationFrame;
globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
  callback(performance.now());
  return 0;
}) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

const results: RangeStructuralResult[] = [];
try {
  for (const rows of ROW_COUNTS) {
    results.push(...(await store_workloads(rows, memory)));
    results.push(await datasource_revision_workload(rows, memory));
    results.push(await auto_fit_workload(rows, memory));
  }
} finally {
  globalThis.requestAnimationFrame = original_request_animation_frame;
  globalThis.cancelAnimationFrame = original_cancel_animation_frame;
  restore_canvas();
}

const artifact: RangeGateArtifact = {
  protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
  mode,
  matrixId: MATRIX_IDS.range[mode],
  results,
};
validateRangeArtifact(artifact, mode);

console.log(
  "| rows | workload | median ms | JS heap Δ | WASM Δ | doc ops | JS patches | FFI | max transfer | revision p/r before→after | max window | chunks |",
);
console.log("|---:|:--|---:|---:|---:|---:|---:|---:|---:|:--|---:|---:|");
for (const result of results) {
  console.log(
    `| ${result.rows.toLocaleString()} | ${result.workload} | ${result.timing.median.toFixed(2)} | ${result.heapDeltaBytes} | ${result.wasmDeltaBytes} | ${result.documentOperationCount} | ${result.jsPatchObjectCount} | ${result.ffiCalls} | ${result.maxTransferredArrayLength} | ${result.retainedRevisionPointsBefore}/${result.retainedRevisionRectanglesBefore}→${result.retainedRevisionPointsAfter}/${result.retainedRevisionRectanglesAfter} | ${result.maxVisibleWindowCells} | ${result.scheduledChunks} |`,
  );
}
console.log(JSON.stringify(artifact));
