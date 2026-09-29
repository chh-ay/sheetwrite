/**
 * Core-path micro benchmarks.
 *
 * Every scenario here exercises one hot path whose cost grows with sheet size
 * rather than with the work the user can see: row-bridge inserts over a large
 * identity array, command-state derivation for a large selection, commit
 * admission and change capture for one large block, the offline commit queue,
 * offline rebase, validation lookups, CSV import, undo of a large clear, a
 * paged revisiting round-trip after eviction, and cold WASM initialization in
 * Node.
 *
 * Each scenario validates its own result before the sample is accepted, so a
 * fast scenario that computes the wrong answer fails the run instead of
 * reporting a good number.
 *
 * Timing: `bun run src/core-paths-bench.ts [--smoke] [--scenario <id,...>]
 * [--output <path>]`. Results are written only to the path given by
 * `--output`; nothing is written to `bench/results`.
 */
import "./dom-setup.js";

import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";

import {
  type CellAddress,
  type CellChange,
  type CellLoadState,
  type CellScalar,
  type ChangeEvent,
  type Column,
  type ColumnarData,
  createGrid,
  createRowBridge,
  type DataSource,
  type DataSourcePage,
  type DataSourceRequest,
  type DataSourceStorageOptions,
  type DataValidationRule,
  type DocumentOp,
  type DocumentRebaseResult,
  fromCsv,
  type Grid,
  type GridCommandStateChangeEvent,
  type GridOptions,
  initSheetwrite,
  MemoryPersistenceAdapter,
  type PackedCellBlock,
  type Range,
  type RowBridgeProjection,
  type RowData,
  rebaseDocumentOperations,
  type Selection,
  type SheetId,
  type SnapshotCell,
  SyncCoordinator,
  type Workbook,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { createGridController, type GridControllerHandlers } from "@sheetwrite/core/adapter";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";
import { initSync } from "@sheetwrite/wasm";

import { assertFiniteNonNegative, type BenchmarkMode, validateRawStat } from "./gate-protocol.js";
import { type ProtocolCaptureMeta, protocolCaptureMeta } from "./protocol-meta.js";
import { collect, forceGc, now, type Stat, summarize } from "./stats.js";

export const CORE_PATHS_BENCHMARK_SCHEMA_VERSION = 1 as const;
const PROTOCOL = "sheetwrite-core-paths-v1";

const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
// The Node child must resolve `@sheetwrite/wasm` from the bench workspace.
const BENCH_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SHEET: SheetId = "s1";
const DOCUMENT_ID = "core-paths-bench";
const EMPTY_ROW: Record<string, CellScalar> = {};
/** Cells touched by one measured `setBlock`; also its encoded-operation ceiling. */
const BLOCK_ENCODED_BYTES = 256 * 1024 * 1024;
/** Aggregate parser ceilings, raised because the default `maxCells` is 1M. */
const CSV_RESOURCE_LIMITS = { maxCells: 64 * 1024 * 1024 } as const;
const SPARSE_COLUMNS = 10;
const SPARSE_ROW_STRIDE = 10;
const SPARSE_RANGE_START_ROW = 1_000;
const PAGED_COLUMNS = 3;
const PAGED_CHUNK_ROWS = 64;
/** Band used by the revisit scenario; the first chunk is never evicted. */
const PAGED_BAND_ROW = PAGED_CHUNK_ROWS * 4;
/** Roughly two clean chunks per column, so walking away evicts the band. */
const PAGED_CACHE_BYTES = 5_040;
const PAGED_EVICTION_ATTEMPTS = 32;
/** Rows the offline commit scenario writes before reusing row 0. */
const COMMIT_ROW_COUNT = 64;
const NODE_HEARTBEAT_MS = 1;
const NODE_GAP_CEILING_MS = 5_000;
/** Untimed turns given to datasource page loads before a revisit is inspected. */
const ASYNC_SETTLE_TURNS = 4;
const COMMAND_STATE_SELECTED_OBSERVATIONS = ["undo"] as const;

export const CORE_PATH_SCENARIOS = [
  "row-bridge-insert",
  "command-state-select",
  "setblock-admission",
  "setblock-detailed-capture",
  "sync-offline-queue",
  "rebase-large",
  "validation-sparse",
  "csv-import",
  "undo-large-clear",
  "paged-evicted-revisit",
  "node-cold-init",
] as const;
export type CorePathScenarioId = (typeof CORE_PATH_SCENARIOS)[number];

/**
 * Sizes for one benchmark mode. `full` follows the workload sizes the
 * performance work is measured against; `smoke` shrinks every dimension so the
 * whole file still runs in seconds.
 */
interface CorePathScale {
  readonly bridgeRows: number;
  readonly bridgeInsertRows: number;
  readonly selectionRows: number;
  readonly selectionColumns: number;
  readonly blockRows: number;
  readonly blockColumns: number;
  readonly offlineCommits: number;
  readonly rebaseBlockRows: number;
  readonly rebaseBlockColumns: number;
  readonly rebaseInsertOperations: number;
  readonly sparseCells: number;
  readonly validationRules: number;
  readonly csvRows: number;
  readonly csvColumns: number;
  readonly clearRows: number;
  readonly clearColumns: number;
  readonly pagedRows: number;
}

const FULL_SCALE: CorePathScale = {
  bridgeRows: 1_000_000,
  bridgeInsertRows: 10_000,
  selectionRows: 64,
  selectionColumns: 64,
  blockRows: 1_000,
  blockColumns: 1_000,
  offlineCommits: 5_000,
  rebaseBlockRows: 1_000,
  rebaseBlockColumns: 100,
  rebaseInsertOperations: 50,
  sparseCells: 100_000,
  validationRules: 100,
  csvRows: 200_000,
  csvColumns: 10,
  clearRows: 1_000,
  clearColumns: 1_000,
  pagedRows: 200_000,
};

const SMOKE_SCALE: CorePathScale = {
  bridgeRows: 20_000,
  bridgeInsertRows: 200,
  selectionRows: 32,
  selectionColumns: 32,
  blockRows: 100,
  blockColumns: 100,
  offlineCommits: 200,
  rebaseBlockRows: 100,
  rebaseBlockColumns: 100,
  rebaseInsertOperations: 10,
  sparseCells: 2_000,
  validationRules: 20,
  csvRows: 2_000,
  csvColumns: 10,
  clearRows: 100,
  clearColumns: 100,
  pagedRows: 4_000,
};

interface SamplePlan {
  readonly warmup: number;
  readonly iters: number;
  readonly gcBetween: boolean;
}

function samplePlan(id: CorePathScenarioId, mode: BenchmarkMode): SamplePlan {
  const smoke = mode === "smoke";
  switch (id) {
    case "row-bridge-insert":
      // Each insert walks a million-entry identity array per created row.
      return { warmup: 1, iters: smoke ? 3 : 2, gcBetween: false };
    case "command-state-select":
      return { warmup: smoke ? 2 : 3, iters: smoke ? 5 : 10, gcBetween: false };
    case "setblock-admission":
      return { warmup: 1, iters: 3, gcBetween: true };
    case "setblock-detailed-capture":
      return { warmup: 1, iters: 3, gcBetween: true };
    case "sync-offline-queue":
      return { warmup: 5, iters: smoke ? 20 : FULL_SCALE.offlineCommits, gcBetween: false };
    case "rebase-large":
      return { warmup: 1, iters: 3, gcBetween: false };
    case "validation-sparse":
      return { warmup: 1, iters: 3, gcBetween: false };
    case "csv-import":
      return { warmup: 1, iters: smoke ? 3 : 2, gcBetween: true };
    case "undo-large-clear":
      return { warmup: 1, iters: 3, gcBetween: true };
    case "paged-evicted-revisit":
      return { warmup: 1, iters: 3, gcBetween: false };
    case "node-cold-init":
      return { warmup: smoke ? 0 : 1, iters: smoke ? 2 : 6, gcBetween: false };
  }
}

/** One raw sample set plus the summary derived from it. */
export interface CorePathVariantResult {
  readonly id: string;
  readonly samplesMs: readonly number[];
  readonly timing: Stat;
}

export interface CorePathScenarioResult {
  readonly id: CorePathScenarioId;
  /** What one timed iteration does. */
  readonly unit: string;
  readonly samplesMs: readonly number[];
  readonly timing: Stat;
  /** Non-time evidence observed while running the scenario. */
  readonly counters: Readonly<Record<string, number>>;
  /** Present when one scenario measures a comparison of two variants. */
  readonly variants?: readonly CorePathVariantResult[];
  /** The result check that ran before this scenario was accepted. */
  readonly validation: string;
}

export interface CorePathsBenchmarkArtifact {
  readonly schemaVersion: typeof CORE_PATHS_BENCHMARK_SCHEMA_VERSION;
  readonly protocol: typeof PROTOCOL;
  readonly mode: BenchmarkMode;
  readonly metadata: ProtocolCaptureMeta;
  readonly toolchain: {
    readonly bun: string;
    readonly node: string;
    readonly platform: string;
    readonly arch: string;
    readonly cpu: string;
  };
  readonly methodology: {
    readonly timing: string;
    readonly scope: string;
  };
  readonly scale: CorePathScale;
  readonly scenarios: readonly CorePathScenarioResult[];
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function fail(message: string): never {
  throw new Error(message);
}

function columnKey(index: number): string {
  return `c${index}`;
}

function numberColumns(count: number, type: "number" | "text" = "number"): Column[] {
  return Array.from({ length: count }, (_, index) => ({
    key: columnKey(index),
    header: `Column ${index + 1}`,
    width: 120,
    type,
  }));
}

function sheetRange(rows: number, columns: number, startRow = 0): Range {
  return {
    sheet: SHEET,
    start: { row: startRow, col: 0 },
    end: { row: startRow + rows - 1, col: columns - 1 },
  };
}

function workbook(rows: number, columns: Column[]): Workbook {
  return {
    activeSheet: SHEET,
    sheets: [{ id: SHEET, name: "Core paths", rowCount: rows, columns }],
  };
}

function numberBlock(rows: number, columns: number, base: number): PackedCellBlock {
  const values = new Array<CellScalar>(rows * columns);
  for (let index = 0; index < values.length; index += 1) values[index] = base + index;
  return { rowCount: rows, colCount: columns, values };
}

function cellAddress(row: number, col: number): CellAddress {
  return { sheet: SHEET, row, col };
}

interface MountedGrid {
  readonly grid: Grid;
  destroy(): void;
}

/** Create a grid without built-in chrome, then tear the host down with it. */
function mountGrid(options: GridOptions): MountedGrid {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGrid(host, {
    ...options,
    config: { toolbar: false, find: false, contextMenu: false },
  });
  return {
    grid,
    destroy(): void {
      grid.destroy();
      host.remove();
    },
  };
}

function assertApplied(status: string, operation: string): void {
  if (status !== "applied") {
    fail(`${operation} was not applied (status ${status})`);
  }
}

function resolvedCell(grid: Grid, row: number, col: number): CellScalar {
  return grid.store.getCell(cellAddress(row, col)).resolved;
}

function cellLoadState(grid: Grid, row: number, col: number): CellLoadState {
  const state = grid.store.getCellLoadState?.(cellAddress(row, col));
  if (state === undefined) {
    fail("paged revisit scenario requires store.getCellLoadState");
  }
  return state;
}

async function settleAsyncWork(): Promise<void> {
  for (let turn = 0; turn < ASYNC_SETTLE_TURNS; turn += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function scenarioResult(
  id: CorePathScenarioId,
  unit: string,
  samplesMs: readonly number[],
  counters: Readonly<Record<string, number>>,
  validation: string,
  variants?: readonly CorePathVariantResult[],
): CorePathScenarioResult {
  const timing = summarize(samplesMs);
  validateRawStat(samplesMs, timing, id);
  for (const [name, value] of Object.entries(counters)) {
    assertFiniteNonNegative(value, `${id}.counters.${name}`);
  }
  return { id, unit, samplesMs, timing, counters, validation, ...(variants ? { variants } : {}) };
}

function variant(id: string, samplesMs: readonly number[]): CorePathVariantResult {
  const timing = summarize(samplesMs);
  validateRawStat(samplesMs, timing, id);
  return { id, samplesMs, timing };
}

// ── row-bridge-insert ───────────────────────────────────────────────────────

function projectRowsIntoBridge(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const defaultRows = new Array<Record<string, CellScalar>>(scale.bridgeRows).fill(EMPTY_ROW);
  let nextRowId = scale.bridgeRows;
  const bridge = createRowBridge<Record<string, CellScalar>, number>({
    columns: [{ key: "value" }],
    defaultRows,
    getRowId: (_row, index) => index,
    sheet: SHEET,
    createRowId: () => {
      const id = nextRowId;
      nextRowId += 1;
      return id;
    },
  });
  const insertAt = Math.floor(scale.bridgeRows / 2);
  let epoch = 0;
  let lastProjection: RowBridgeProjection<number> | undefined;
  const samplesMs = collect(
    () => {
      epoch += 1;
      const event: ChangeEvent = {
        transaction: {
          patches: [{ op: "addRows", sheet: SHEET, at: insertAt, count: scale.bridgeInsertRows }],
          epoch,
        },
        changes: [],
        commitReason: "structure",
        source: "local",
      };
      lastProjection = bridge.project(event);
    },
    { warmup: plan.warmup, iters: plan.iters },
  );

  const projection = requireValue(lastProjection, "row bridge insert timed no projection");
  const delta = requireValue(projection.deltas[0], "row bridge insert projected no delta");
  if (
    projection.deltas.length !== 1 ||
    delta.kind !== "row-structure" ||
    delta.action !== "insert"
  ) {
    fail(`row bridge insert projected ${delta.kind} instead of one row-structure insert`);
  }
  if (delta.count !== scale.bridgeInsertRows || delta.inserted.length !== scale.bridgeInsertRows) {
    fail(`row bridge insert projected ${delta.inserted.length} of ${scale.bridgeInsertRows} rows`);
  }
  const identityCount = scale.bridgeRows + (plan.warmup + plan.iters) * scale.bridgeInsertRows;
  const rowIds = bridge.rowIds(SHEET);
  if (rowIds.length !== identityCount) {
    fail(`row bridge holds ${rowIds.length} identities, expected ${identityCount}`);
  }
  if (new Set(delta.inserted).size !== delta.inserted.length) {
    fail("row bridge insert produced duplicate row identities");
  }
  for (let offset = 0; offset < delta.inserted.length; offset += 1) {
    if (rowIds[insertAt + offset] !== delta.inserted[offset]) {
      fail(`row bridge identity at ${insertAt + offset} does not match the projected insert`);
    }
  }
  return scenarioResult(
    "row-bridge-insert",
    `one addRows projection of ${scale.bridgeInsertRows.toLocaleString("en-US")} rows into a ${scale.bridgeRows.toLocaleString("en-US")}-row bridge`,
    samplesMs,
    { bridgeRows: scale.bridgeRows, insertedRows: scale.bridgeInsertRows },
    "projected delta is one row-structure insert with every created identity present in the bridge in order",
  );
}

// ── command-state-select ────────────────────────────────────────────────────

function selectWithCommandState(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const handlers: GridControllerHandlers = {};
  const host = document.createElement("div");
  document.body.appendChild(host);
  const controller = createGridController(
    host,
    {
      workbook: workbook(scale.selectionRows * 2, numberColumns(scale.selectionColumns)),
      config: { toolbar: false, find: false, contextMenu: false },
    },
    handlers,
  );
  const grid = controller.grid;
  const selectedCells = scale.selectionRows * scale.selectionColumns;
  const at = (offset: number): Selection => ({
    kind: "range",
    range: sheetRange(scale.selectionRows, scale.selectionColumns, offset * scale.selectionRows),
  });
  let tick = 0;
  const select = (): void => {
    tick += 1;
    grid.setSelection(at(tick % 2));
  };

  const withoutHandler = collect(select, { warmup: plan.warmup, iters: plan.iters });

  let commandStateEvents = 0;
  let commandStateEventsTotal = 0;
  let lastCommandState: GridCommandStateChangeEvent | undefined;
  handlers.onCommandStateChange = (event) => {
    commandStateEvents += 1;
    commandStateEventsTotal += 1;
    lastCommandState = event;
  };
  const withHandler = collect(select, {
    warmup: plan.warmup,
    iters: plan.iters,
    before: () => {
      commandStateEvents = 0;
    },
  });

  const selection = grid.getSelection();
  if (selection?.kind !== "range") fail("command-state selection is not a range");
  const bounds = selection.range;
  const selected =
    (bounds.end.row - bounds.start.row + 1) * (bounds.end.col - bounds.start.col + 1);
  if (selected !== selectedCells) {
    fail(`command-state selection covers ${selected} cells, expected ${selectedCells}`);
  }
  if (commandStateEvents < 1) {
    fail("command-state handler observed no event for the last selection");
  }
  const states = requireValue(lastCommandState, "command-state handler observed no event").states;
  for (const command of COMMAND_STATE_SELECTED_OBSERVATIONS) {
    const state = requireValue(states[command], `command-state event omits ${command}`);
    if (state.disabled !== true) fail(`fresh sheet reports ${command} as enabled`);
  }
  controller.destroy();
  host.remove();

  return scenarioResult(
    "command-state-select",
    `one ${selectedCells.toLocaleString("en-US")}-cell range selection on a framework-style grid`,
    withHandler,
    {
      selectedCells,
      commandStateEvents: commandStateEventsTotal,
      withoutHandlerMedianMs: summarize(withoutHandler).median,
    },
    `selection covers ${selectedCells} cells and the command-state handler observes one event per selection`,
    [
      variant("with-command-state-handler", withHandler),
      variant("without-command-state-handler", withoutHandler),
    ],
  );
}

// ── setblock-admission / setblock-detailed-capture ───────────────────────────

function applyOneBlock(
  scale: CorePathScale,
  plan: SamplePlan,
  detailedCapture: boolean,
): CorePathScenarioResult {
  const mounted = mountGrid({
    workbook: workbook(scale.blockRows, numberColumns(scale.blockColumns)),
    transactionResourceLimits: { maxEncodedBytes: BLOCK_ENCODED_BYTES },
  });
  const { grid } = mounted;
  const cellCount = scale.blockRows * scale.blockColumns;
  const blockRange = sheetRange(scale.blockRows, scale.blockColumns);
  const centreOffset = Math.floor(cellCount / 2);
  const probeOffsets = [0, scale.blockColumns - 1, centreOffset, cellCount - 1] as const;
  // The listener keeps only the first write's evidence: the first write is the
  // one that turns empty cells into values, and holding a whole change array for
  // the run would dominate memory.
  let capturedChanges = 0;
  let centreChange: CellChange | undefined;
  const unsubscribe = detailedCapture
    ? grid.on("change", (event) => {
        if (centreChange !== undefined) return;
        capturedChanges = event.changes.length;
        centreChange = event.changes[centreOffset];
      })
    : undefined;
  grid.store.setDetailedChangeCapture?.(detailedCapture);

  let generation = 0;
  const samplesMs = collect(
    () => {
      generation += 1;
      const result = grid.applyTransaction({
        patches: [
          {
            op: "setBlock",
            range: blockRange,
            block: numberBlock(scale.blockRows, scale.blockColumns, generation * cellCount),
          },
        ],
      });
      assertApplied(result.status, "setBlock");
    },
    { warmup: plan.warmup, iters: plan.iters, gcBetween: plan.gcBetween },
  );

  const expected = (plan.warmup + plan.iters) * cellCount;
  for (const offset of probeOffsets) {
    const row = Math.floor(offset / scale.blockColumns);
    const col = offset % scale.blockColumns;
    if (resolvedCell(grid, row, col) !== expected + offset) {
      fail(`setBlock cell ${row}:${col} does not hold the last written value`);
    }
  }
  const counters: Record<string, number> = {
    blockCells: cellCount,
    transactions: plan.warmup + plan.iters,
  };
  let validation =
    "every setBlock is applied and corner, centre, and last cells hold the last written values";
  if (detailedCapture) {
    if (capturedChanges !== cellCount) {
      fail(`detailed change capture reported ${capturedChanges} of ${cellCount} cell changes`);
    }
    const probe = requireValue(centreChange, "no captured change at the block centre");
    counters.capturedChanges = capturedChanges;
    // The first timed write fills a fresh sheet, so its previous value is empty.
    if (probe.newValue.kind !== "literal" || probe.newValue.value !== cellCount + centreOffset) {
      fail(
        `captured change at the block centre carries the written value ${JSON.stringify(probe.newValue)}`,
      );
    }
    if (probe.oldValue.kind !== "literal" || probe.oldValue.value !== null) {
      fail(
        `captured change at the block centre carries the previous value ${JSON.stringify(probe.oldValue)}`,
      );
    }
    validation +=
      ", and the first write's change event carries one captured entry per cell with before/after values";
  }
  unsubscribe?.();
  mounted.destroy();

  return scenarioResult(
    detailedCapture ? "setblock-detailed-capture" : "setblock-admission",
    `one Grid.applyTransaction of a ${cellCount.toLocaleString("en-US")}-cell setBlock${
      detailedCapture ? " observed through a change listener with detailed capture" : ""
    }`,
    samplesMs,
    counters,
    validation,
  );
}

// ── sync-offline-queue ──────────────────────────────────────────────────────

function queueOfflineCommits(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const rows = Math.min(scale.offlineCommits, COMMIT_ROW_COUNT);
  const mounted = mountGrid({ workbook: workbook(rows, numberColumns(4)) });
  const { grid } = mounted;
  const snapshot: WorkbookSnapshot = {
    schemaVersion: 1,
    documentId: DOCUMENT_ID,
    version: 0,
    workbook: { activeSheet: SHEET },
    sheets: [
      {
        id: SHEET,
        name: "Core paths",
        order: 0,
        rowCount: rows,
        columns: numberColumns(4),
        cells: [],
      },
    ],
  };
  const coordinator = new SyncCoordinator(grid, new MemoryPersistenceAdapter(snapshot), {
    documentId: DOCUMENT_ID,
    serverVersion: 0,
    initialConnection: "offline",
  });

  let commit = 0;
  let rejected = 0;
  const samplesMs = collect(
    () => {
      const row = commit % rows;
      commit += 1;
      const result = grid.applyTransaction({
        patches: [
          { op: "set", addr: cellAddress(row, 0), value: { kind: "literal", value: commit } },
        ],
      });
      if (result.status !== "applied") rejected += 1;
    },
    { warmup: plan.warmup, iters: plan.iters },
  );

  const queued = plan.warmup + plan.iters;
  if (rejected !== 0) fail(`${rejected} offline commits were rejected by admission`);
  if (coordinator.pendingCount !== queued) {
    fail(`offline queue holds ${coordinator.pendingCount} commits, expected ${queued}`);
  }
  if (coordinator.state.pendingCapacity !== "available") {
    fail(`offline queue reports capacity ${coordinator.state.pendingCapacity}`);
  }
  const records = coordinator.pendingCommits();
  const first = requireValue(records[0], "offline queue holds no commit");
  const last = requireValue(records[records.length - 1], "offline queue holds no commit");
  if (first.status !== "pending" || first.baseVersion !== 0) {
    fail(`offline queue first record is ${first.status} at version ${first.baseVersion}`);
  }
  if (last.baseVersion !== queued - 1 || last.operations.length !== 1) {
    fail(
      `offline queue does not chain every commit onto the previous version (last ${last.baseVersion})`,
    );
  }
  if (new Set(records.map((record) => record.clientMutationId)).size !== queued) {
    fail("offline queue reused a mutation identity");
  }
  const lastOperation = requireValue(
    last.operations[0],
    "offline queue record carries no operation",
  );
  if (
    lastOperation.op !== "set" ||
    lastOperation.value.kind !== "literal" ||
    lastOperation.value.value !== queued
  ) {
    fail("offline queue does not carry the last committed value");
  }
  coordinator.destroy();
  mounted.destroy();

  return scenarioResult(
    "sync-offline-queue",
    "one grid commit admitted into an offline sync queue with no listeners",
    samplesMs,
    { queuedCommits: queued, admittedOperations: queued },
    "every commit is applied, the queue holds every commit at server version 0, and capacity stays available",
  );
}

// ── rebase-large ────────────────────────────────────────────────────────────

function rebaseBlockAcrossInserts(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const blockStartRow = 5_000;
  const blockRange: Range = {
    sheet: SHEET,
    start: { row: blockStartRow, col: 0 },
    end: { row: blockStartRow + scale.rebaseBlockRows - 1, col: scale.rebaseBlockColumns - 1 },
  };
  const localOperations: readonly DocumentOp[] = [
    {
      op: "setBlock",
      range: blockRange,
      block: numberBlock(scale.rebaseBlockRows, scale.rebaseBlockColumns, 0),
    },
  ];
  let generation = 0;
  let remoteOperations: DocumentOp[] = [];
  let lastResult: DocumentRebaseResult | undefined;
  const samplesMs = collect(
    () => {
      lastResult = rebaseDocumentOperations(localOperations, remoteOperations);
    },
    {
      warmup: plan.warmup,
      iters: plan.iters,
      before: () => {
        generation += 1;
        remoteOperations = Array.from({ length: scale.rebaseInsertOperations }, (_, index) => ({
          op: "addRows" as const,
          sheet: SHEET,
          at: 200 + index * 2 + (generation % 3),
          count: 1,
        }));
      },
    },
  );

  const result = requireValue(lastResult, "rebase timed no result");
  if (result.status !== "rebased") {
    fail(`rebase of a non-overlapping block reported ${result.status}`);
  }
  const rebased = requireValue(result.operations[0], "rebase returned no operation");
  if (rebased.op !== "setBlock") fail(`rebase returned ${rebased.op} instead of setBlock`);
  const shift = scale.rebaseInsertOperations;
  if (rebased.range.start.row !== blockRange.start.row + shift) {
    fail(
      `rebased block starts at row ${rebased.range.start.row}, expected ${blockRange.start.row + shift}`,
    );
  }
  if (rebased.range.end.row !== blockRange.end.row + shift) {
    fail(
      `rebased block ends at row ${rebased.range.end.row}, expected ${blockRange.end.row + shift}`,
    );
  }
  const blockCells = scale.rebaseBlockRows * scale.rebaseBlockColumns;
  if (
    rebased.block.values.length !== blockCells ||
    rebased.block.rowCount !== scale.rebaseBlockRows
  ) {
    fail("rebased block lost cells");
  }
  return scenarioResult(
    "rebase-large",
    `one rebase of a ${blockCells.toLocaleString("en-US")}-cell block across ${shift} single-row inserts`,
    samplesMs,
    { blockCells, insertOperations: shift },
    "the block rebases without conflict and shifts down by exactly the inserted row count",
  );
}

// ── validation-sparse ───────────────────────────────────────────────────────

function writeSparseRangeWithRules(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const filledRows = scale.sparseCells / SPARSE_COLUMNS;
  const rangeRows = filledRows * SPARSE_ROW_STRIDE;
  const rules: DataValidationRule[] = Array.from({ length: scale.validationRules }, (_, index) => ({
    id: `rule-${index}`,
    range: {
      sheet: SHEET,
      start: { row: index, col: 0 },
      end: { row: index, col: 0 },
    },
    condition: { kind: "number", min: 0, max: 10 },
    policy: "reject",
  }));
  const mounted = mountGrid({
    workbook: workbook(SPARSE_RANGE_START_ROW + rangeRows, numberColumns(SPARSE_COLUMNS)),
    transactionResourceLimits: { maxEncodedBytes: BLOCK_ENCODED_BYTES },
  });
  const { grid } = mounted;
  for (const rule of rules) grid.setValidationRule(rule);

  const range = sheetRange(rangeRows, SPARSE_COLUMNS, SPARSE_RANGE_START_ROW);
  const buildCells = (base: number): SnapshotCell[] => {
    const cells: SnapshotCell[] = [];
    for (let row = 0; row < filledRows; row += 1) {
      for (let col = 0; col < SPARSE_COLUMNS; col += 1) {
        cells.push({
          rowOffset: row * SPARSE_ROW_STRIDE,
          colOffset: col,
          value: { kind: "literal", value: base + row * SPARSE_COLUMNS + col },
        });
      }
    }
    return cells;
  };

  let generation = 0;
  const samplesMs = collect(
    () => {
      generation += 1;
      const result = grid.applyTransaction({
        patches: [{ op: "setRange", range, cells: buildCells(generation * scale.sparseCells) }],
      });
      assertApplied(result.status, "sparse setRange");
    },
    { warmup: plan.warmup, iters: plan.iters },
  );

  const expected = (plan.warmup + plan.iters) * scale.sparseCells;
  const probes = [0, Math.floor(scale.sparseCells / 2), scale.sparseCells - 1];
  for (const index of probes) {
    const row = SPARSE_RANGE_START_ROW + Math.floor(index / SPARSE_COLUMNS) * SPARSE_ROW_STRIDE;
    const col = index % SPARSE_COLUMNS;
    if (resolvedCell(grid, row, col) !== expected + index) {
      fail(`sparse setRange cell ${row}:${col} does not hold the last written value`);
    }
  }
  const storedRules = grid.store.getWorkbook().sheets[0]?.validationRules?.length ?? 0;
  if (storedRules !== scale.validationRules) {
    fail(`sheet holds ${storedRules} validation rules, expected ${scale.validationRules}`);
  }
  const violated = grid.applyTransaction({
    patches: [{ op: "set", addr: cellAddress(0, 0), value: { kind: "literal", value: 999 } }],
  });
  if (violated.status !== "rejected") {
    fail(`a value outside the rule bounds was ${violated.status} instead of rejected`);
  }
  if (!violated.issues.some((issue) => issue.kind === "validation")) {
    fail("the rejected write carries no validation issue");
  }
  mounted.destroy();

  return scenarioResult(
    "validation-sparse",
    `one ${scale.sparseCells.toLocaleString("en-US")}-cell sparse setRange with ${scale.validationRules} rules outside the range`,
    samplesMs,
    {
      writtenCells: scale.sparseCells,
      logicalRangeCells: rangeRows * SPARSE_COLUMNS,
      validationRules: scale.validationRules,
    },
    "every write is applied, probe cells hold the last written values, every rule is retained, and a rule violation is still rejected",
  );
}

// ── csv-import ──────────────────────────────────────────────────────────────

function buildCsvText(rows: number, columns: number): string {
  const lines = new Array<string>(rows + 1);
  const header = new Array<string>(columns);
  for (let col = 0; col < columns; col += 1) header[col] = `Header ${col + 1}`;
  lines[0] = header.join(",");
  for (let row = 0; row < rows; row += 1) {
    const fields = new Array<string>(columns);
    for (let col = 0; col < columns; col += 1) {
      fields[col] = col % 2 === 0 ? String(row * columns + col) : `row-${row}-c${col}`;
    }
    lines[row + 1] = fields.join(",");
  }
  return lines.join("\n");
}

function importCsvText(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const text = buildCsvText(scale.csvRows, scale.csvColumns);
  const columns: Column[] = Array.from({ length: scale.csvColumns }, (_, index) => ({
    key: columnKey(index),
    header: `Header ${index + 1}`,
    width: 120,
    type: index % 2 === 0 ? "number" : "text",
  }));
  const options = { resourceLimits: CSV_RESOURCE_LIMITS };
  let last: ColumnarData | undefined;
  const samplesMs = collect(
    () => {
      last = fromCsv(text, columns, options);
    },
    { warmup: plan.warmup, iters: plan.iters, gcBetween: plan.gcBetween },
  );

  const data = requireValue(last, "csv import timed no result");
  if (data.rowCount !== scale.csvRows) {
    fail(`csv import produced ${data.rowCount} rows, expected ${scale.csvRows}`);
  }
  const firstColumn = requireValue(data.columns[columnKey(0)], "csv import lost the first column");
  const secondColumn = requireValue(
    data.columns[columnKey(1)],
    "csv import lost the second column",
  );
  const lastRow = scale.csvRows - 1;
  const expectedNumber = lastRow * scale.csvColumns;
  const numberProbe = requireValue(firstColumn[lastRow], "csv import lost the last numeric cell");
  if (numberProbe !== expectedNumber) {
    fail(`csv import last numeric cell is ${String(numberProbe)}, expected ${expectedNumber}`);
  }
  const textProbe = requireValue(secondColumn[lastRow], "csv import lost the last text cell");
  if (textProbe !== `row-${lastRow}-c1`) {
    fail(`csv import last text cell is ${String(textProbe)}`);
  }
  for (const index of [0, Math.floor(lastRow / 2), lastRow]) {
    const numeric = requireValue(firstColumn[index], `csv import lost numeric row ${index}`);
    if (numeric !== index * scale.csvColumns) {
      fail(`csv import numeric row ${index} is ${String(numeric)}`);
    }
    const text = requireValue(secondColumn[index], `csv import lost text row ${index}`);
    if (text !== `row-${index}-c1`) {
      fail(`csv import text row ${index} is ${String(text)}`);
    }
  }
  return scenarioResult(
    "csv-import",
    `one fromCsv import of ${scale.csvRows.toLocaleString("en-US")} rows by ${scale.csvColumns} columns`,
    samplesMs,
    { importedRows: scale.csvRows, importedColumns: scale.csvColumns, inputChars: text.length },
    "row count matches, numeric and text columns keep their declared types, and first, middle, and last rows carry the source values",
  );
}

// ── undo-large-clear ────────────────────────────────────────────────────────

function undoLargeClear(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const cellCount = scale.clearRows * scale.clearColumns;
  const data: ColumnarData = {
    rowCount: scale.clearRows,
    columns: Object.fromEntries(
      Array.from({ length: scale.clearColumns }, (_, col) => [
        columnKey(col),
        Float64Array.from({ length: scale.clearRows }, (_, row) => row * scale.clearColumns + col),
      ]),
    ),
  };
  const mounted = mountGrid({
    workbook: workbook(scale.clearRows, numberColumns(scale.clearColumns)),
    data,
  });
  const { grid } = mounted;
  const clearOperation: DocumentOp = {
    op: "clearRange",
    range: sheetRange(scale.clearRows, scale.clearColumns),
    contents: true,
    style: false,
  };
  const lastRow = scale.clearRows - 1;
  const lastColumn = scale.clearColumns - 1;
  const expectedLast = lastRow * scale.clearColumns + lastColumn;

  assertApplied(grid.applyTransaction({ patches: [clearOperation] }).status, "clearRange");
  if (resolvedCell(grid, lastRow, lastColumn) !== null) {
    fail("clearRange left contents behind");
  }
  grid.undo();
  if (resolvedCell(grid, lastRow, lastColumn) !== expectedLast) {
    fail("undo of a clearRange did not restore the cleared block");
  }

  let clears = 0;
  const samplesMs = collect(
    () => {
      grid.undo();
    },
    {
      warmup: plan.warmup,
      iters: plan.iters,
      gcBetween: plan.gcBetween,
      before: () => {
        clears += 1;
        assertApplied(grid.applyTransaction({ patches: [clearOperation] }).status, "clearRange");
      },
    },
  );

  for (const row of [0, Math.floor(scale.clearRows / 2), lastRow] as const) {
    for (const col of [0, lastColumn] as const) {
      if (resolvedCell(grid, row, col) !== row * scale.clearColumns + col) {
        fail(`undo left cell ${row}:${col} cleared after the measured iterations`);
      }
    }
  }
  mounted.destroy();

  return scenarioResult(
    "undo-large-clear",
    `one undo of a ${cellCount.toLocaleString("en-US")}-cell clearRange`,
    samplesMs,
    { clearedCells: cellCount, clears },
    "the clear empties the block and every measured undo restores the original values",
  );
}

// ── paged-evicted-revisit ───────────────────────────────────────────────────

interface ColumnLoadProbe {
  areColumnsFullyLoaded(
    sheet: SheetId,
    startRow: number,
    endRow: number,
    columns: readonly number[],
  ): boolean;
}

async function revisitEvictedBand(
  scale: CorePathScale,
  plan: SamplePlan,
): Promise<CorePathScenarioResult> {
  const datasource: DataSource = {
    capabilities: { protocol: 2, columns: "windowed" },
    getRows: async (request: DataSourceRequest): Promise<DataSourcePage> => {
      const rows: RowData[] = [];
      for (let row = request.start; row < request.end; row += 1) {
        const data: RowData = {};
        for (const band of request.columns) {
          for (let index = 0; index < band.keys.length; index += 1) {
            const key = requireValue(band.keys[index], "datasource band key");
            data[key] = row + Number(key.slice(1));
          }
        }
        rows.push(data);
      }
      return { protocol: 2, start: request.start, columns: request.columns, rows };
    },
  };
  const storage: DataSourceStorageOptions = {
    mode: "paged",
    chunkRows: PAGED_CHUNK_ROWS,
    cacheBytes: PAGED_CACHE_BYTES,
  };
  const mounted = mountGrid({
    workbook: workbook(scale.pagedRows, numberColumns(PAGED_COLUMNS)),
    datasource,
    datasourceStorage: storage,
  });
  const { grid } = mounted;
  const probe = grid.store as typeof grid.store & ColumnLoadProbe;
  const fullyLoaded = probe.areColumnsFullyLoaded.bind(probe);
  let fullyLoadedCalls = 0;
  probe.areColumnsFullyLoaded = (sheet, startRow, endRow, requested) => {
    fullyLoadedCalls += 1;
    return fullyLoaded(sheet, startRow, endRow, requested);
  };

  const bandRow = PAGED_BAND_ROW;
  const visit = async (row: number): Promise<void> => {
    grid.scrollToCell(cellAddress(row, 0));
    await settleAsyncWork();
  };
  await visit(bandRow);
  if (cellLoadState(grid, bandRow, 0) !== "loaded-value") {
    fail("the first band did not load");
  }
  const expectedValue = bandRow + 1;
  if (resolvedCell(grid, bandRow, 1) !== expectedValue) {
    fail("the loaded band carries unexpected values");
  }

  const evictionSpan = scale.pagedRows - PAGED_BAND_ROW - PAGED_CHUNK_ROWS * 3;
  let evictionCursor = 0;
  const evict = async (): Promise<number> => {
    for (let attempt = 1; attempt <= PAGED_EVICTION_ATTEMPTS; attempt += 1) {
      // Walk away from the band in single-chunk steps and never restart the walk:
      // a walk that returns to rows near the band re-loads its chunks through
      // speculative prefetch, so the band never ages out of the cache.
      const step = evictionCursor * PAGED_CHUNK_ROWS;
      const distantRow = PAGED_BAND_ROW + PAGED_CHUNK_ROWS * 2 + (step % evictionSpan);
      evictionCursor += 1;
      await visit(distantRow);
      if (cellLoadState(grid, bandRow, 0) === "unloaded") return attempt;
    }
    return FAILED_EVICTION;
  };

  const samplesMs: number[] = [];
  let evictionVisits = 0;
  let revisitCalls = 0;
  for (let iteration = 0; iteration < plan.warmup + plan.iters; iteration += 1) {
    const attempts = await evict();
    if (attempts === FAILED_EVICTION) {
      fail(`the band was still loaded after ${PAGED_EVICTION_ATTEMPTS} distant visits`);
    }
    const callsBefore = fullyLoadedCalls;
    const started = now();
    await visit(bandRow);
    const elapsed = now() - started;
    if (iteration >= plan.warmup) {
      samplesMs.push(elapsed);
      revisitCalls += fullyLoadedCalls - callsBefore;
      evictionVisits += attempts;
    }
    if (cellLoadState(grid, bandRow, 0) !== "loaded-value") {
      fail("the revisiting round did not reload the evicted band");
    }
    if (resolvedCell(grid, bandRow, 1) !== expectedValue) {
      fail("the reloaded band carries unexpected values");
    }
  }
  mounted.destroy();

  return scenarioResult(
    "paged-evicted-revisit",
    "one revisit of an evicted paged band, including the reload it triggers",
    samplesMs,
    {
      revisitedRows: plan.iters,
      areColumnsFullyLoadedCalls: revisitCalls,
      evictionVisits,
      pagedRows: scale.pagedRows,
    },
    "the band is unloaded before each revisit, the revisit reloads it with the source values, and the revisit asks areColumnsFullyLoaded at least once",
  );
}

const FAILED_EVICTION = -1;

// ── node-cold-init ──────────────────────────────────────────────────────────

/**
 * Runs in a fresh Node process. The child loads `@sheetwrite/wasm` through a
 * dynamic import so nothing else is imported before the timer starts: `load()`
 * is timed as a cold module initialization, and the heartbeat records how long
 * the event loop stalls while the module initializes.
 */
const NODE_CHILD_PROGRAM = `
const wasm = await import("@sheetwrite/wasm");
const ticks = [];
const heartbeat = setInterval(() => { ticks.push(performance.now()); }, ${NODE_HEARTBEAT_MS});
const startedAt = performance.now();
await wasm.load();
const loadMs = performance.now() - startedAt;
clearInterval(heartbeat);
let largestGapMs = 0;
for (let index = 1; index < ticks.length; index += 1) {
  largestGapMs = Math.max(largestGapMs, ticks[index] - ticks[index - 1]);
}
const { SheetwriteStore } = await import("@sheetwrite/core");
const workbook = {
  activeSheet: "s1",
  sheets: [{ id: "s1", name: "Core paths", rowCount: 4, columns: [{ key: "c0", header: "C0", width: 80, type: "number" }] }],
};
const store = new SheetwriteStore(workbook);
const applied = store.applyTransaction({
  patches: [{ op: "set", addr: { sheet: "s1", row: 0, col: 0 }, value: { kind: "literal", value: 42 } }],
});
process.stdout.write(JSON.stringify({
  loadMs,
  largestGapMs,
  loaded: wasm.isLoaded(),
  heartbeatTicks: ticks.length,
  engineStatus: applied.status,
  engineValue: store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved,
}));
`;

interface NodeLoadSample {
  readonly loadMs: number;
  readonly largestGapMs: number;
  readonly loaded: boolean;
  readonly heartbeatTicks: number;
  readonly engineStatus: string;
  readonly engineValue: CellScalar;
}

function parseNodeLoadSample(stdout: string, stderr: string, exitCode: number): NodeLoadSample {
  const line = stdout.trim();
  if (line.length === 0) {
    throw new Error(`node cold init produced no output (exit ${exitCode}): ${stderr.trim()}`);
  }
  const parsed: unknown = JSON.parse(line);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("node cold init output is not an object");
  }
  const record = parsed as Record<string, unknown>;
  const loadMs = record.loadMs;
  const largestGapMs = record.largestGapMs;
  const heartbeatTicks = record.heartbeatTicks;
  if (
    typeof loadMs !== "number" ||
    typeof largestGapMs !== "number" ||
    typeof heartbeatTicks !== "number"
  ) {
    throw new Error("node cold init output is missing numbers");
  }
  return {
    loadMs,
    largestGapMs,
    loaded: record.loaded === true,
    heartbeatTicks,
    engineStatus: String(record.engineStatus),
    engineValue: record.engineValue as CellScalar,
  };
}

async function loadWasmInFreshNode(plan: SamplePlan): Promise<CorePathScenarioResult> {
  const samplesMs: number[] = [];
  let largestGapMs = 0;
  let minimalHeartbeatTicks = Number.POSITIVE_INFINITY;
  for (let iteration = 0; iteration < plan.warmup + plan.iters; iteration += 1) {
    const child = Bun.spawn(["node", "--input-type=module", "-e", NODE_CHILD_PROGRAM], {
      cwd: BENCH_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const sample = parseNodeLoadSample(stdout, stderr, exitCode);
    if (!sample.loaded) fail("the fresh Node process did not finish loading the module");
    if (sample.engineStatus !== "applied" || sample.engineValue !== 42) {
      fail("the loaded module did not produce the expected engine result");
    }
    if (!(sample.loadMs > 0)) fail("the fresh Node process reported a non-positive load time");
    if (!(sample.largestGapMs >= 0) || sample.largestGapMs > NODE_GAP_CEILING_MS) {
      fail(
        `the fresh Node process reported an implausible heartbeat gap of ${sample.largestGapMs} ms`,
      );
    }
    if (sample.heartbeatTicks < 1) fail("the heartbeat produced no tick while the module loaded");
    largestGapMs = Math.max(largestGapMs, sample.largestGapMs);
    minimalHeartbeatTicks = Math.min(minimalHeartbeatTicks, sample.heartbeatTicks);
    if (iteration >= plan.warmup) samplesMs.push(sample.loadMs);
  }
  return scenarioResult(
    "node-cold-init",
    `one cold load() of @sheetwrite/wasm in a fresh Node process (${
      plan.warmup + plan.iters
    } processes)`,
    samplesMs,
    {
      largestHeartbeatGapMs: largestGapMs,
      minimalHeartbeatTicks,
      freshProcesses: plan.warmup + plan.iters,
    },
    "every fresh process loads the module, produces the expected engine result, and reports a plausible heartbeat gap",
  );
}

// ── artifact ────────────────────────────────────────────────────────────────

export const CORE_PATH_SCENARIO_RUNNERS: Readonly<
  Record<
    CorePathScenarioId,
    (
      scale: CorePathScale,
      plan: SamplePlan,
    ) => Promise<CorePathScenarioResult> | CorePathScenarioResult
  >
> = {
  "row-bridge-insert": projectRowsIntoBridge,
  "command-state-select": selectWithCommandState,
  "setblock-admission": (scale, plan) => applyOneBlock(scale, plan, false),
  "setblock-detailed-capture": (scale, plan) => applyOneBlock(scale, plan, true),
  "sync-offline-queue": queueOfflineCommits,
  "rebase-large": rebaseBlockAcrossInserts,
  "validation-sparse": writeSparseRangeWithRules,
  "csv-import": importCsvText,
  "undo-large-clear": undoLargeClear,
  "paged-evicted-revisit": revisitEvictedBand,
  "node-cold-init": (_scale, plan) => loadWasmInFreshNode(plan),
};

/** Fail-closed validation of a completed artifact, mirroring the raw evidence. */
export function validateCorePathsBenchmark(
  result: CorePathsBenchmarkArtifact,
  expectedMode: BenchmarkMode = result.mode,
  expectedIds: readonly CorePathScenarioId[] = CORE_PATH_SCENARIOS,
): void {
  if (result.schemaVersion !== CORE_PATHS_BENCHMARK_SCHEMA_VERSION) {
    fail(`core paths artifact schema version is ${result.schemaVersion}`);
  }
  if (result.protocol !== PROTOCOL) fail(`core paths artifact protocol is ${result.protocol}`);
  if (result.mode !== expectedMode) fail(`core paths artifact mode is ${result.mode}`);
  if (result.metadata.commit.length === 0) fail("core paths artifact carries no commit");
  const observed = result.scenarios.map((scenario) => scenario.id);
  for (const id of expectedIds) {
    const matches = observed.filter((candidate) => candidate === id).length;
    if (matches !== 1) {
      fail(`core paths artifact contains ${matches} results for scenario ${id}`);
    }
  }
  if (observed.length !== expectedIds.length) {
    fail(`core paths artifact contains ${observed.length} scenario results`);
  }
  for (const scenario of result.scenarios) {
    validateRawStat(scenario.samplesMs, scenario.timing, scenario.id);
    if (scenario.samplesMs.length === 0) fail(`${scenario.id} carries no samples`);
    if (scenario.unit.length === 0 || scenario.validation.length === 0) {
      fail(`${scenario.id} does not describe what it measured`);
    }
    for (const [name, value] of Object.entries(scenario.counters)) {
      assertFiniteNonNegative(value, `${scenario.id}.counters.${name}`);
    }
    for (const entry of scenario.variants ?? []) {
      validateRawStat(entry.samplesMs, entry.timing, `${scenario.id}:${entry.id}`);
    }
  }
}

export async function runCorePathsBenchmark(
  mode: BenchmarkMode,
  scenarioIds: readonly CorePathScenarioId[] = CORE_PATH_SCENARIOS,
): Promise<CorePathsBenchmarkArtifact> {
  const scale = mode === "smoke" ? SMOKE_SCALE : FULL_SCALE;
  const bytes = readFileSync(WASM_PATH);
  await initSheetwrite(bytes);
  const wasm = initSync({ module: bytes });
  const restoreCanvas = installCanvasTestStubs();
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  // Run scheduled paints inside the call that schedules them, so selection
  // scenarios do not depend on happy-dom's animation-frame timing.
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callback(now());
    return 0;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

  const scenarios: CorePathScenarioResult[] = [];
  try {
    for (const id of scenarioIds) {
      const plan = samplePlan(id, mode);
      forceGc();
      scenarios.push(await CORE_PATH_SCENARIO_RUNNERS[id](scale, plan));
      forceGc();
    }
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    restoreCanvas();
  }

  const artifact: CorePathsBenchmarkArtifact = {
    schemaVersion: CORE_PATHS_BENCHMARK_SCHEMA_VERSION,
    protocol: PROTOCOL,
    mode,
    metadata: protocolCaptureMeta(),
    toolchain: {
      bun: Bun.version,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model ?? "unknown",
    },
    methodology: {
      timing: "collect() warmups then timed samples per scenario; samplesMs is the raw evidence",
      scope:
        "Each scenario owns its setup, validates its own result, and reports non-time counters beside the timing so a wrong-but-fast path cannot pass the run.",
    },
    scale,
    scenarios,
  };
  if (wasm.memory.buffer.byteLength <= 0) fail("the loaded module exposes no memory");
  validateCorePathsBenchmark(artifact, mode, scenarioIds);
  return artifact;
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function parseScenarioIds(value: string | undefined): readonly CorePathScenarioId[] {
  if (value === undefined) return CORE_PATH_SCENARIOS;
  const requested = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  for (const entry of requested) {
    if (!CORE_PATH_SCENARIOS.some((id) => id === entry)) {
      throw new Error(
        `unknown scenario ${entry}; expected one of ${CORE_PATH_SCENARIOS.join(", ")}`,
      );
    }
  }
  return requested as readonly CorePathScenarioId[];
}

function reportTable(scenarios: readonly CorePathScenarioResult[]): string {
  const lines = ["| scenario | unit | median ms | p95 ms | samples |", "|:--|:--|---:|---:|---:|"];
  for (const scenario of scenarios) {
    lines.push(
      `| ${scenario.id} | ${scenario.unit} | ${scenario.timing.median.toFixed(3)} | ${scenario.timing.p95.toFixed(3)} | ${scenario.timing.iters} |`,
    );
    for (const entry of scenario.variants ?? []) {
      lines.push(
        `| ${scenario.id}:${entry.id} | variant | ${entry.timing.median.toFixed(3)} | ${entry.timing.p95.toFixed(3)} | ${entry.timing.iters} |`,
      );
    }
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const mode: BenchmarkMode = args.includes("--smoke") ? "smoke" : "full";
  const artifact = await runCorePathsBenchmark(
    mode,
    parseScenarioIds(optionValue(args, "--scenario")),
  );
  process.stdout.write(`${reportTable(artifact.scenarios)}\n`);
  const output = optionValue(args, "--output");
  if (output !== undefined) await Bun.write(output, `${JSON.stringify(artifact, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(artifact)}\n`);
}
