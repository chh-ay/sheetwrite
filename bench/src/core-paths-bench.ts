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
/** Rows read per bounded window when a scenario verifies a whole block. */
const VERIFY_WINDOW_ROWS = 256;

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
  // Undo restores the cleared numbers as one transaction. 500,000 cells stay
  // under the default 8 MiB payload limit; 1,000,000 cells are just above it,
  // and the Grid then rejects that undo by design.
  clearRows: 1_000,
  clearColumns: 500,
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
  /** Non-numeric evidence, such as the runtime a child process reported. */
  readonly observations?: Readonly<Record<string, string>>;
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
    /** Node compatibility version reported by the Bun runtime. */
    readonly nodeCompat: string;
    /** Version of the `node` executable the cold-init scenario spawned. */
    readonly nodeLoader?: string;
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

/**
 * Compare every cell of a `rows` x `columns` block against the row-major base
 * of the last written generation. Runs after timing, in bounded row windows, so
 * a block that only wrote part of its cells fails instead of reporting a number.
 */
function assertWindowedValues(
  grid: Grid,
  rows: number,
  columns: number,
  expectedBase: number,
  label: string,
): void {
  const cols = Array.from({ length: columns }, (_, index) => index);
  for (let start = 0; start < rows; start += VERIFY_WINDOW_ROWS) {
    const end = Math.min(start + VERIFY_WINDOW_ROWS, rows);
    const window = grid.store.getVisibleWindow(SHEET, { start, end }, cols);
    for (let row = start; row < end; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const actual = window.values[(row - start) * columns + col];
        const expected = expectedBase + row * columns + col;
        if (actual !== expected) {
          fail(`${label} cell ${row}:${col} is ${String(actual)}, expected ${expected}`);
        }
      }
    }
  }
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

interface ScenarioExtras {
  readonly variants?: readonly CorePathVariantResult[];
  readonly observations?: Readonly<Record<string, string>>;
}

function scenarioResult(
  id: CorePathScenarioId,
  unit: string,
  samplesMs: readonly number[],
  counters: Readonly<Record<string, number>>,
  validation: string,
  extras: ScenarioExtras = {},
): CorePathScenarioResult {
  const timing = summarize(samplesMs);
  validateRawStat(samplesMs, timing, id);
  for (const [name, value] of Object.entries(counters)) {
    assertFiniteNonNegative(value, `${id}.counters.${name}`);
  }
  for (const [name, value] of Object.entries(extras.observations ?? {})) {
    if (value.length === 0) fail(`${id}.observations.${name} is empty`);
  }
  return {
    id,
    unit,
    samplesMs,
    timing,
    counters,
    validation,
    ...(extras.variants ? { variants: extras.variants } : {}),
    ...(extras.observations ? { observations: extras.observations } : {}),
  };
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
    {
      variants: [
        variant("with-command-state-handler", withHandler),
        variant("without-command-state-handler", withoutHandler),
      ],
    },
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
  const timedGenerations = plan.warmup + plan.iters;
  // The timed loop performs no validation reads. The listener only records how
  // many changes the engine captured; the whole-block read and the capture
  // probe that checks every captured before/after value run after it.
  let timedCapturedChanges = 0;
  let validatingCapture = false;
  let probeChanges = 0;
  let probeMismatches = 0;
  let probeBase = 0;
  let probePreviousBase = 0;
  const seenCells = detailedCapture ? new Uint8Array(cellCount) : undefined;
  const unsubscribe = detailedCapture
    ? grid.on("change", (event) => {
        if (!validatingCapture) {
          // Record one change count while timing and touch nothing else.
          if (timedCapturedChanges === 0) timedCapturedChanges = event.changes.length;
          return;
        }
        probeChanges = event.changes.length;
        const seen = seenCells;
        if (seen === undefined) fail("the capture probe has no cell mask");
        for (const change of event.changes) {
          const { sheet, row, col } = change.addr;
          const offset = row * scale.blockColumns + col;
          if (
            sheet !== SHEET ||
            row < 0 ||
            row >= scale.blockRows ||
            col < 0 ||
            col >= scale.blockColumns ||
            seen[offset] !== 0
          ) {
            probeMismatches += 1;
            continue;
          }
          seen[offset] = 1;
          if (
            change.newValue.kind !== "literal" ||
            change.newValue.value !== probeBase + offset ||
            change.oldValue.kind !== "literal" ||
            change.oldValue.value !== probePreviousBase + offset
          ) {
            probeMismatches += 1;
          }
        }
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

  const counters: Record<string, number> = {
    blockCells: cellCount,
    transactions: timedGenerations,
  };
  let validation =
    "every setBlock is applied and every cell of the block holds the last written value";
  assertWindowedValues(
    grid,
    scale.blockRows,
    scale.blockColumns,
    timedGenerations * cellCount,
    "setBlock",
  );
  if (detailedCapture) {
    if (timedCapturedChanges !== cellCount) {
      fail(`the timed block captured ${timedCapturedChanges} of ${cellCount} cell changes`);
    }
    // One more untimed write, so every captured change is checked against the
    // values it replaced and the values it wrote.
    probeBase = (timedGenerations + 1) * cellCount;
    probePreviousBase = timedGenerations * cellCount;
    validatingCapture = true;
    assertApplied(
      grid.applyTransaction({
        patches: [
          {
            op: "setBlock",
            range: blockRange,
            block: numberBlock(scale.blockRows, scale.blockColumns, probeBase),
          },
        ],
      }).status,
      "setBlock capture probe",
    );
    validatingCapture = false;
    const seen = requireValue(seenCells, "the capture probe has no cell mask");
    const distinct = seen.reduce((total, entry) => total + entry, 0);
    if (probeChanges !== cellCount || distinct !== cellCount || probeMismatches !== 0) {
      fail(
        `the capture probe reported ${probeChanges} changes, ${distinct} distinct cells, and ${probeMismatches} mismatched before/after values`,
      );
    }
    counters.capturedChanges = timedCapturedChanges;
    counters.validatedCapturedChanges = probeChanges;
    validation +=
      ", and its change capture reports every cell's address, previous value, and new value exactly once";
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
  const localBlock = numberBlock(scale.rebaseBlockRows, scale.rebaseBlockColumns, 0);
  const localOperations: readonly DocumentOp[] = [
    { op: "setBlock", range: blockRange, block: localBlock },
  ];
  const sourceValues = localBlock.values.slice();
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
    rebased.block.rowCount !== scale.rebaseBlockRows ||
    rebased.block.colCount !== scale.rebaseBlockColumns
  ) {
    fail("rebased block lost cells");
  }
  // Every rebased value must equal its source value, and the rebase must leave
  // both the caller's operation array and the block it owns untouched.
  const input = requireValue(localOperations[0], "rebase input operation is missing");
  if (input.op !== "setBlock") fail(`rebase input operation is ${input.op}`);
  if (
    input.range.start.row !== blockRange.start.row ||
    input.range.end.row !== blockRange.end.row ||
    input.range.start.col !== blockRange.start.col ||
    input.range.end.col !== blockRange.end.col
  ) {
    fail("rebase modified its input range");
  }
  if (localOperations.length !== 1) fail("rebase changed the input operation count");
  for (let offset = 0; offset < blockCells; offset += 1) {
    if (rebased.block.values[offset] !== sourceValues[offset]) {
      fail(`rebased block value ${offset} does not match the source value`);
    }
    if (input.block.values[offset] !== sourceValues[offset]) {
      fail(`rebase modified its input block at offset ${offset}`);
    }
  }
  return scenarioResult(
    "rebase-large",
    `one rebase of a ${blockCells.toLocaleString("en-US")}-cell block across ${shift} single-row inserts`,
    samplesMs,
    { blockCells, insertOperations: shift, verifiedValues: blockCells },
    "the block rebases without conflict, shifts down by exactly the inserted row count, keeps every source value, and leaves the caller's operations untouched",
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
  // Every row and column is compared against the generator formula, so a wrong
  // parse, a shifted column, or a lost row fails instead of reporting a number.
  for (let col = 0; col < columns.length; col += 1) {
    const column = requireValue(columns[col], `csv import lost column ${col}`);
    const source = requireValue(data.columns[column.key], `csv import lost column ${column.key}`);
    const expectedColumn = col % 2 === 0;
    for (let row = 0; row < scale.csvRows; row += 1) {
      const expected = expectedColumn ? row * scale.csvColumns + col : `row-${row}-c${col}`;
      if (source[row] !== expected) {
        fail(
          `csv import cell ${row}:${col} is ${String(source[row])}, expected ${String(expected)}`,
        );
      }
    }
  }
  return scenarioResult(
    "csv-import",
    `one fromCsv import of ${scale.csvRows.toLocaleString("en-US")} rows by ${scale.csvColumns} columns`,
    samplesMs,
    {
      importedRows: scale.csvRows,
      importedColumns: scale.csvColumns,
      verifiedCells: scale.csvRows * scale.csvColumns,
      inputChars: text.length,
    },
    "row count matches and every imported cell equals the source value for its row and column, including declared number/text types",
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

  // Every cell is compared against its original value after timing: a partial
  // restore fails here even though each undo returned normally.
  assertWindowedValues(grid, scale.clearRows, scale.clearColumns, 0, "undo restore");
  mounted.destroy();

  return scenarioResult(
    "undo-large-clear",
    `one undo of a ${cellCount.toLocaleString("en-US")}-cell clearRange`,
    samplesMs,
    { clearedCells: cellCount, clears, restoredCells: cellCount },
    "the clear empties the block and the undos restore every original cell value",
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
    "one revisit of an evicted paged band: scroll back plus a fixed async settle floor (wall time is not the accept metric)",
    samplesMs,
    {
      revisitedRows: plan.iters,
      areColumnsFullyLoadedCalls: revisitCalls,
      evictionVisits,
      pagedRows: scale.pagedRows,
    },
    "the band is unloaded before each revisit, the revisit reloads it with the source values, and the revisit asks areColumnsFullyLoaded at least once; areColumnsFullyLoadedCalls per revisit is the accept metric",
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
const endedAt = performance.now();
const loadMs = endedAt - startedAt;
clearInterval(heartbeat);
let previousTick = startedAt;
let largestGapMs = 0;
for (const tick of ticks) {
  largestGapMs = Math.max(largestGapMs, tick - previousTick);
  previousTick = tick;
}
largestGapMs = Math.max(largestGapMs, endedAt - previousTick);
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
  nodeVersion: process.version,
}));
`;

interface NodeLoadSample {
  readonly loadMs: number;
  readonly largestGapMs: number;
  readonly loaded: boolean;
  readonly heartbeatTicks: number;
  readonly engineStatus: string;
  readonly engineValue: CellScalar;
  readonly nodeVersion: string;
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
    typeof heartbeatTicks !== "number" ||
    typeof record.nodeVersion !== "string" ||
    record.nodeVersion.length === 0
  ) {
    throw new Error("node cold init output is missing numbers or the runtime version");
  }
  return {
    loadMs,
    largestGapMs,
    loaded: record.loaded === true,
    heartbeatTicks,
    engineStatus: String(record.engineStatus),
    engineValue: record.engineValue as CellScalar,
    nodeVersion: record.nodeVersion,
  };
}

async function loadWasmInFreshNode(plan: SamplePlan): Promise<CorePathScenarioResult> {
  const samplesMs: number[] = [];
  let largestGapMs = 0;
  let minimalHeartbeatTicks = Number.POSITIVE_INFINITY;
  let nodeVersion = "";
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
    if (nodeVersion.length === 0) nodeVersion = sample.nodeVersion;
    else if (nodeVersion !== sample.nodeVersion) {
      fail(`the fresh Node processes disagree on their runtime version`);
    }
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
    { observations: { nodeVersion } },
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
    for (const [name, value] of Object.entries(scenario.observations ?? {})) {
      if (value.length === 0) fail(`${scenario.id}.observations.${name} is empty`);
    }
    for (const entry of scenario.variants ?? []) {
      validateRawStat(entry.samplesMs, entry.timing, `${scenario.id}:${entry.id}`);
    }
  }
  if (result.toolchain.bun.length === 0 || result.toolchain.nodeCompat.length === 0) {
    fail("core paths artifact carries no toolchain versions");
  }
  if (
    result.toolchain.nodeLoader !== undefined &&
    result.toolchain.nodeLoader !==
      result.scenarios.find((scenario) => scenario.id === "node-cold-init")?.observations
        ?.nodeVersion
  ) {
    fail("core paths artifact toolchain disagrees with the cold-init scenario runtime");
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

  const nodeLoaderVersion = scenarios.find((scenario) => scenario.id === "node-cold-init")
    ?.observations?.nodeVersion;
  const artifact: CorePathsBenchmarkArtifact = {
    schemaVersion: CORE_PATHS_BENCHMARK_SCHEMA_VERSION,
    protocol: PROTOCOL,
    mode,
    metadata: protocolCaptureMeta(),
    toolchain: {
      bun: Bun.version,
      nodeCompat: process.version,
      ...(nodeLoaderVersion === undefined ? {} : { nodeLoader: nodeLoaderVersion }),
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
