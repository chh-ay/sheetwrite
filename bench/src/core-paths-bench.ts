/**
 * Core-path micro benchmarks.
 *
 * Every scenario here exercises one hot path whose cost grows with sheet size
 * rather than with the work the user can see: row-bridge inserts over a large
 * identity array, command-state derivation for a large selection, commit
 * admission and change capture for one large block, the offline commit queue,
 * remote versions applied to a sheet of formulas, one local transaction of
 * scattered cell edits on that sheet, new values for linked workbooks that
 * formulas read, offline rebase, validation lookups, CSV import, undo of a
 * large clear, a paged revisiting round-trip after eviction, cold WASM
 * initialization in Node, and a row-border drag that resizes one row of a
 * 100-, 100,000- or 1,000,000-row sheet.
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
  createGridController,
  type GridControllerHandlers,
} from "../../packages/core/src/adapter.js";
import { getEngine } from "../../packages/core/src/engine.js";
import { OffsetIndex } from "../../packages/core/src/fenwick.js";
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
  DEFAULT_THEME,
  type DocumentOp,
  type DocumentRebaseResult,
  type ExternalLink,
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
} from "../../packages/core/src/index.js";
import { encodeRestoreBlock } from "../../packages/core/src/restore-block.js";
import { installCanvasTestStubs } from "../../packages/core/src/testing.js";
import { optionValue } from "./cli-options.js";
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

/** Number columns A-H of the row-sum sheet; column I sums them. */
const REMOTE_NUMBER_COLUMNS = 8;
/** Cells one scattered local transaction writes, each in column A of its own row. */
const SCATTERED_EDIT_CELLS = 300;

export const CORE_PATH_SCENARIOS = [
  "row-bridge-insert",
  "command-state-select",
  "setblock-admission",
  "setblock-detailed-capture",
  "sync-offline-queue",
  "sync-remote-versions",
  "local-scattered-edits",
  "external-links-refresh",
  "rebase-large",
  "validation-sparse",
  "csv-import",
  "undo-large-clear",
  "restore-near-ceiling",
  "paged-evicted-revisit",
  "node-cold-init",
  "row-resize-100",
  "row-resize-100k",
  "row-resize-1m",
] as const;
export type CorePathScenarioId = (typeof CORE_PATH_SCENARIOS)[number];

type RowResizeScenarioId = "row-resize-100" | "row-resize-100k" | "row-resize-1m";

/** Sheet rows of each row-resize scenario; smoke runs use the same sheets. */
const ROW_RESIZE_ROWS: Readonly<Record<RowResizeScenarioId, number>> = {
  "row-resize-100": 100,
  "row-resize-100k": 100_000,
  "row-resize-1m": 1_000_000,
};
/** Pointer moves of one row-border drag, one pixel each; every move previews the height. */
const ROW_RESIZE_DRAG_STEPS = 20;

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
  /** Rows of the row-sum sheet, each with one SUM formula. */
  readonly remoteRows: number;
  /** Rows of the linked-workbook sheet, each with one local SUM formula. */
  readonly linkRows: number;
  /** Linked workbooks, each with one sheet of `linkCells` cached values. */
  readonly links: number;
  /** Cached values of each linked sheet; a formula reads each one. */
  readonly linkCells: number;
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
  remoteRows: 10_000,
  linkRows: 50_000,
  links: 10,
  linkCells: 1_000,
  rebaseBlockRows: 1_000,
  rebaseBlockColumns: 100,
  rebaseInsertOperations: 50,
  sparseCells: 100_000,
  validationRules: 100,
  csvRows: 200_000,
  csvColumns: 10,
  // A million-cell clear exceeds ordinary wire admission and must compact on undo.
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
  remoteRows: 200,
  linkRows: 2_000,
  links: 3,
  linkCells: 100,
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

function sample_plan(id: CorePathScenarioId, mode: BenchmarkMode): SamplePlan {
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
    case "sync-remote-versions":
      return { warmup: smoke ? 2 : 20, iters: smoke ? 20 : 200, gcBetween: false };
    case "local-scattered-edits":
      return { warmup: 2, iters: smoke ? 5 : 21, gcBetween: false };
    case "external-links-refresh":
      return { warmup: 2, iters: smoke ? 5 : 15, gcBetween: false };
    case "rebase-large":
      return { warmup: 1, iters: 3, gcBetween: false };
    case "validation-sparse":
      return { warmup: 1, iters: 3, gcBetween: false };
    case "csv-import":
      return { warmup: 1, iters: smoke ? 3 : 2, gcBetween: true };
    case "undo-large-clear":
    case "restore-near-ceiling":
      return { warmup: 1, iters: 3, gcBetween: true };
    case "paged-evicted-revisit":
      return { warmup: 1, iters: 3, gcBetween: false };
    case "node-cold-init":
      return { warmup: smoke ? 0 : 1, iters: smoke ? 2 : 6, gcBetween: false };
    case "row-resize-100":
    case "row-resize-100k":
    case "row-resize-1m":
      return { warmup: smoke ? 1 : 5, iters: smoke ? 5 : 41, gcBetween: true };
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

function require_value<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function fail(message: string): never {
  throw new Error(message);
}

function column_key(index: number): string {
  return `c${index}`;
}

function number_columns(count: number, type: "number" | "text" = "number"): Column[] {
  return Array.from({ length: count }, (_, index) => ({
    key: column_key(index),
    header: `Column ${index + 1}`,
    width: 120,
    type,
  }));
}

function sheet_range(rows: number, columns: number, start_row = 0): Range {
  return {
    sheet: SHEET,
    start: { row: start_row, col: 0 },
    end: { row: start_row + rows - 1, col: columns - 1 },
  };
}

function workbook(rows: number, columns: Column[]): Workbook {
  return {
    activeSheet: SHEET,
    sheets: [{ id: SHEET, name: "Core paths", rowCount: rows, columns }],
  };
}

function number_block(rows: number, columns: number, base: number): PackedCellBlock {
  const values = new Array<CellScalar>(rows * columns);
  for (let index = 0; index < values.length; index += 1) values[index] = base + index;
  return { rowCount: rows, colCount: columns, values };
}

function cell_address(row: number, col: number): CellAddress {
  return { sheet: SHEET, row, col };
}

interface MountedGrid {
  readonly grid: Grid;
  destroy(): void;
}

/** Create a grid without built-in chrome, then tear the host down with it. */
function mount_grid(options: GridOptions): MountedGrid {
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

function assert_applied(status: string, operation: string): void {
  if (status !== "applied") {
    fail(`${operation} was not applied (status ${status})`);
  }
}

function resolved_cell(grid: Grid, row: number, col: number): CellScalar {
  return grid.store.getCell(cell_address(row, col)).resolved;
}

/**
 * Compare every cell of a `rows` x `columns` block against the row-major base
 * of the last written generation. Runs after timing, in bounded row windows, so
 * a block that only wrote part of its cells fails instead of reporting a number.
 */
function assert_windowed_values(
  grid: Grid,
  rows: number,
  columns: number,
  expected_base: number,
  label: string,
): void {
  const cols = Array.from({ length: columns }, (_, index) => index);
  for (let start = 0; start < rows; start += VERIFY_WINDOW_ROWS) {
    const end = Math.min(start + VERIFY_WINDOW_ROWS, rows);
    const window = grid.store.getVisibleWindow(SHEET, { start, end }, cols);
    for (let row = start; row < end; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const actual = window.values[(row - start) * columns + col];
        const expected = expected_base + row * columns + col;
        if (actual !== expected) {
          fail(`${label} cell ${row}:${col} is ${String(actual)}, expected ${expected}`);
        }
      }
    }
  }
}

function cell_load_state(grid: Grid, row: number, col: number): CellLoadState {
  const state = grid.store.getCellLoadState?.(cell_address(row, col));
  if (state === undefined) {
    fail("paged revisit scenario requires store.getCellLoadState");
  }
  return state;
}

async function settle_async_work(): Promise<void> {
  for (let turn = 0; turn < ASYNC_SETTLE_TURNS; turn += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

interface ScenarioExtras {
  readonly variants?: readonly CorePathVariantResult[];
  readonly observations?: Readonly<Record<string, string>>;
}

function scenario_result(
  id: CorePathScenarioId,
  unit: string,
  samples_ms: readonly number[],
  counters: Readonly<Record<string, number>>,
  validation: string,
  extras: ScenarioExtras = {},
): CorePathScenarioResult {
  const timing = summarize(samples_ms);
  validateRawStat(samples_ms, timing, id);
  for (const [name, value] of Object.entries(counters)) {
    assertFiniteNonNegative(value, `${id}.counters.${name}`);
  }
  for (const [name, value] of Object.entries(extras.observations ?? {})) {
    if (value.length === 0) fail(`${id}.observations.${name} is empty`);
  }
  return {
    id,
    unit,
    samplesMs: samples_ms,
    timing,
    counters,
    validation,
    ...(extras.variants ? { variants: extras.variants } : {}),
    ...(extras.observations ? { observations: extras.observations } : {}),
  };
}

function variant(id: string, samples_ms: readonly number[]): CorePathVariantResult {
  const timing = summarize(samples_ms);
  validateRawStat(samples_ms, timing, id);
  return { id, samplesMs: samples_ms, timing };
}

function project_rows_into_bridge(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const default_rows = new Array<Record<string, CellScalar>>(scale.bridgeRows).fill(EMPTY_ROW);
  let next_row_id = scale.bridgeRows;
  const bridge = createRowBridge<Record<string, CellScalar>, number>({
    columns: [{ key: "value" }],
    defaultRows: default_rows,
    getRowId: (_row, index) => index,
    sheet: SHEET,
    createRowId: () => {
      const id = next_row_id;
      next_row_id += 1;
      return id;
    },
  });
  const insert_at = Math.floor(scale.bridgeRows / 2);
  let epoch = 0;
  let last_projection: RowBridgeProjection<number> | undefined;
  const samples_ms = collect(
    () => {
      epoch += 1;
      const event: ChangeEvent = {
        transaction: {
          patches: [{ op: "addRows", sheet: SHEET, at: insert_at, count: scale.bridgeInsertRows }],
          epoch,
        },
        changes: [],
        commitReason: "structure",
        source: "local",
      };
      last_projection = bridge.project(event);
    },
    { warmup: plan.warmup, iters: plan.iters },
  );

  const projection = require_value(last_projection, "row bridge insert timed no projection");
  const delta = require_value(projection.deltas[0], "row bridge insert projected no delta");
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
  const identity_count = scale.bridgeRows + (plan.warmup + plan.iters) * scale.bridgeInsertRows;
  const row_ids = bridge.rowIds(SHEET);
  if (row_ids.length !== identity_count) {
    fail(`row bridge holds ${row_ids.length} identities, expected ${identity_count}`);
  }
  if (new Set(delta.inserted).size !== delta.inserted.length) {
    fail("row bridge insert produced duplicate row identities");
  }
  for (let offset = 0; offset < delta.inserted.length; offset += 1) {
    if (row_ids[insert_at + offset] !== delta.inserted[offset]) {
      fail(`row bridge identity at ${insert_at + offset} does not match the projected insert`);
    }
  }
  return scenario_result(
    "row-bridge-insert",
    `one addRows projection of ${scale.bridgeInsertRows.toLocaleString("en-US")} rows into a ${scale.bridgeRows.toLocaleString("en-US")}-row bridge`,
    samples_ms,
    { bridgeRows: scale.bridgeRows, insertedRows: scale.bridgeInsertRows },
    "projected delta is one row-structure insert with every created identity present in the bridge in order",
  );
}

function select_with_command_state(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const handlers: GridControllerHandlers = {};
  const host = document.createElement("div");
  document.body.appendChild(host);
  const controller = createGridController(
    host,
    {
      workbook: workbook(scale.selectionRows * 2, number_columns(scale.selectionColumns)),
      config: { toolbar: false, find: false, contextMenu: false },
    },
    handlers,
  );
  const grid = controller.grid;
  const selected_cells = scale.selectionRows * scale.selectionColumns;
  const at = (offset: number): Selection => ({
    kind: "range",
    range: sheet_range(scale.selectionRows, scale.selectionColumns, offset * scale.selectionRows),
  });
  let tick = 0;
  const select = (): void => {
    tick += 1;
    grid.setSelection(at(tick % 2));
  };

  const without_handler = collect(select, { warmup: plan.warmup, iters: plan.iters });

  let command_state_events = 0;
  let command_state_events_total = 0;
  let last_command_state: GridCommandStateChangeEvent | undefined;
  handlers.onCommandStateChange = (event) => {
    command_state_events += 1;
    command_state_events_total += 1;
    last_command_state = event;
  };
  const with_handler = collect(select, {
    warmup: plan.warmup,
    iters: plan.iters,
    before: () => {
      command_state_events = 0;
    },
  });

  const selection = grid.getSelection();
  if (selection?.kind !== "range") fail("command-state selection is not a range");
  const bounds = selection.range;
  const selected =
    (bounds.end.row - bounds.start.row + 1) * (bounds.end.col - bounds.start.col + 1);
  if (selected !== selected_cells) {
    fail(`command-state selection covers ${selected} cells, expected ${selected_cells}`);
  }
  if (command_state_events < 1) {
    fail("command-state handler observed no event for the last selection");
  }
  const states = require_value(
    last_command_state,
    "command-state handler observed no event",
  ).states;
  for (const command of COMMAND_STATE_SELECTED_OBSERVATIONS) {
    const state = require_value(states[command], `command-state event omits ${command}`);
    if (state.disabled !== true) fail(`fresh sheet reports ${command} as enabled`);
  }
  controller.destroy();
  host.remove();

  return scenario_result(
    "command-state-select",
    `one ${selected_cells.toLocaleString("en-US")}-cell range selection on a framework-style grid`,
    with_handler,
    {
      selectedCells: selected_cells,
      commandStateEvents: command_state_events_total,
      withoutHandlerMedianMs: summarize(without_handler).median,
    },
    `selection covers ${selected_cells} cells and the command-state handler observes one event per selection`,
    {
      variants: [
        variant("with-command-state-handler", with_handler),
        variant("without-command-state-handler", without_handler),
      ],
    },
  );
}

function apply_one_block(
  scale: CorePathScale,
  plan: SamplePlan,
  detailed_capture: boolean,
): CorePathScenarioResult {
  const mounted = mount_grid({
    workbook: workbook(scale.blockRows, number_columns(scale.blockColumns)),
    transactionResourceLimits: { maxEncodedBytes: BLOCK_ENCODED_BYTES },
  });
  const { grid } = mounted;
  const cell_count = scale.blockRows * scale.blockColumns;
  const block_range = sheet_range(scale.blockRows, scale.blockColumns);
  const timed_generations = plan.warmup + plan.iters;
  // The timed loop performs no validation reads. The listener only records how
  // many changes the engine captured; the whole-block read and the capture
  // probe that checks every captured before/after value run after it.
  let timed_captured_changes = 0;
  let validating_capture = false;
  let probe_changes = 0;
  let probe_mismatches = 0;
  let probe_base = 0;
  let probe_previous_base = 0;
  const seen_cells = detailed_capture ? new Uint8Array(cell_count) : undefined;
  const unsubscribe = detailed_capture
    ? grid.on("change", (event) => {
        if (!validating_capture) {
          // Record one change count while timing and touch nothing else.
          if (timed_captured_changes === 0) timed_captured_changes = event.changes.length;
          return;
        }
        probe_changes = event.changes.length;
        const seen = seen_cells;
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
            probe_mismatches += 1;
            continue;
          }
          seen[offset] = 1;
          if (
            change.newValue.kind !== "literal" ||
            change.newValue.value !== probe_base + offset ||
            change.oldValue.kind !== "literal" ||
            change.oldValue.value !== probe_previous_base + offset
          ) {
            probe_mismatches += 1;
          }
        }
      })
    : undefined;
  grid.store.setDetailedChangeCapture?.(detailed_capture);

  let generation = 0;
  const samples_ms = collect(
    () => {
      generation += 1;
      const result = grid.applyTransaction({
        patches: [
          {
            op: "setBlock",
            range: block_range,
            block: number_block(scale.blockRows, scale.blockColumns, generation * cell_count),
          },
        ],
      });
      assert_applied(result.status, "setBlock");
    },
    { warmup: plan.warmup, iters: plan.iters, gcBetween: plan.gcBetween },
  );

  const counters: Record<string, number> = {
    blockCells: cell_count,
    transactions: timed_generations,
  };
  let validation =
    "every setBlock is applied and every cell of the block holds the last written value";
  assert_windowed_values(
    grid,
    scale.blockRows,
    scale.blockColumns,
    timed_generations * cell_count,
    "setBlock",
  );
  if (detailed_capture) {
    if (timed_captured_changes !== cell_count) {
      fail(`the timed block captured ${timed_captured_changes} of ${cell_count} cell changes`);
    }
    // One more untimed write, so every captured change is checked against the
    // values it replaced and the values it wrote.
    probe_base = (timed_generations + 1) * cell_count;
    probe_previous_base = timed_generations * cell_count;
    validating_capture = true;
    assert_applied(
      grid.applyTransaction({
        patches: [
          {
            op: "setBlock",
            range: block_range,
            block: number_block(scale.blockRows, scale.blockColumns, probe_base),
          },
        ],
      }).status,
      "setBlock capture probe",
    );
    validating_capture = false;
    const seen = require_value(seen_cells, "the capture probe has no cell mask");
    const distinct = seen.reduce((total, entry) => total + entry, 0);
    if (probe_changes !== cell_count || distinct !== cell_count || probe_mismatches !== 0) {
      fail(
        `the capture probe reported ${probe_changes} changes, ${distinct} distinct cells, and ${probe_mismatches} mismatched before/after values`,
      );
    }
    counters.capturedChanges = timed_captured_changes;
    counters.validatedCapturedChanges = probe_changes;
    validation +=
      ", and its change capture reports every cell's address, previous value, and new value exactly once";
  }
  unsubscribe?.();
  mounted.destroy();

  return scenario_result(
    detailed_capture ? "setblock-detailed-capture" : "setblock-admission",
    `one Grid.applyTransaction of a ${cell_count.toLocaleString("en-US")}-cell setBlock${
      detailed_capture ? " observed through a change listener with detailed capture" : ""
    }`,
    samples_ms,
    counters,
    validation,
  );
}

function queue_offline_commits(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const rows = Math.min(scale.offlineCommits, COMMIT_ROW_COUNT);
  const mounted = mount_grid({ workbook: workbook(rows, number_columns(4)) });
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
        columns: number_columns(4),
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
  const samples_ms = collect(
    () => {
      const row = commit % rows;
      commit += 1;
      const result = grid.applyTransaction({
        patches: [
          { op: "set", addr: cell_address(row, 0), value: { kind: "literal", value: commit } },
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
  const first = require_value(records[0], "offline queue holds no commit");
  const last = require_value(records[records.length - 1], "offline queue holds no commit");
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
  const last_operation = require_value(
    last.operations[0],
    "offline queue record carries no operation",
  );
  if (
    last_operation.op !== "set" ||
    last_operation.value.kind !== "literal" ||
    last_operation.value.value !== queued
  ) {
    fail("offline queue does not carry the last committed value");
  }
  coordinator.destroy();
  mounted.destroy();

  return scenario_result(
    "sync-offline-queue",
    "one grid commit admitted into an offline sync queue with no listeners",
    samples_ms,
    { queuedCommits: queued, admittedOperations: queued },
    "every commit is applied, the queue holds every commit at server version 0, and capacity stays available",
  );
}

/** A grid whose `rows` rows hold 1 to 8 in columns A-H and their SUM in column I. */
function mount_row_sums(rows: number): MountedGrid & { readonly columns: Column[] } {
  const columns = number_columns(REMOTE_NUMBER_COLUMNS + 1);
  const mounted = mount_grid({ workbook: workbook(rows, columns) });
  const values = new Array<CellScalar>(rows * columns.length).fill(null);
  const formulas: Array<[number, string]> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < REMOTE_NUMBER_COLUMNS; col += 1) {
      values[row * columns.length + col] = col + 1;
    }
    formulas.push([row * columns.length + REMOTE_NUMBER_COLUMNS, `=SUM(A${row + 1}:H${row + 1})`]);
  }
  const block: PackedCellBlock = { rowCount: rows, colCount: columns.length, values, formulas };
  assert_applied(
    mounted.grid.applyTransaction({
      patches: [{ op: "setBlock", range: sheet_range(rows, columns.length), block }],
    }).status,
    "row-sum sheet setup",
  );
  return { ...mounted, columns };
}

/**
 * Remote versions of one cell edit each, applied through a SyncCoordinator to
 * a sheet whose every row sums its number columns. Only the edited row's sum
 * reads the edit, so a version should cost about what a local edit costs.
 */
async function apply_remote_versions(
  scale: CorePathScale,
  plan: SamplePlan,
): Promise<CorePathScenarioResult> {
  const rows = scale.remoteRows;
  const mounted = mount_row_sums(rows);
  const { grid, columns } = mounted;
  const snapshot: WorkbookSnapshot = {
    schemaVersion: 1,
    documentId: DOCUMENT_ID,
    version: 0,
    workbook: { activeSheet: SHEET },
    sheets: [{ id: SHEET, name: "Core paths", order: 0, rowCount: rows, columns, cells: [] }],
  };
  const coordinator = new SyncCoordinator(grid, new MemoryPersistenceAdapter(snapshot), {
    documentId: DOCUMENT_ID,
    serverVersion: 0,
  });

  // Each version writes a new value to column A of a different row.
  const edited_row = (version: number): number => (version * 7) % rows;
  const samples_ms: number[] = [];
  let version = 0;
  for (let iteration = 0; iteration < plan.warmup + plan.iters; iteration += 1) {
    version += 1;
    const operation: DocumentOp = {
      op: "set",
      addr: cell_address(edited_row(version), 0),
      value: { kind: "literal", value: version },
    };
    const started = now();
    await coordinator.applyVersionedOperation({ version, operations: [operation] });
    const elapsed = now() - started;
    if (iteration >= plan.warmup) samples_ms.push(elapsed);
  }

  if (coordinator.serverVersion !== version) {
    fail(`the grid reached server version ${coordinator.serverVersion}, expected ${version}`);
  }
  // Columns B-H hold 2 to 8, so a row sums to its column A value plus 35.
  const last_row = edited_row(version);
  if (resolved_cell(grid, last_row, REMOTE_NUMBER_COLUMNS) !== version + 35) {
    fail(`row ${last_row} does not sum the last remote value`);
  }
  if (resolved_cell(grid, rows - 1, REMOTE_NUMBER_COLUMNS) !== 36) {
    fail("a row that no version edited does not keep its sum");
  }
  coordinator.destroy();
  mounted.destroy();

  return scenario_result(
    "sync-remote-versions",
    `one remote version of one cell edit applied to a sheet of ${rows.toLocaleString("en-US")} SUM formulas`,
    samples_ms,
    { remoteVersions: plan.iters, formulas: rows },
    "every version is applied in order, the last edited row sums its new value, and an unedited row keeps its sum",
  );
}

/**
 * One local transaction that writes one cell, in one of columns A-H, of each
 * of `SCATTERED_EDIT_CELLS` rows spread over the row-sum sheet. Each cell has
 * one reader, so the transaction should cost about its cells' readers, not
 * the sheet.
 */
function apply_scattered_edits(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const rows = scale.remoteRows;
  const cells = Math.min(SCATTERED_EDIT_CELLS, rows);
  const mounted = mount_row_sums(rows);
  const { grid } = mounted;
  // 37 is prime to the row count, so the rows of one transaction differ.
  const edited_row = (generation: number, cell: number): number => (cell * 37 + generation) % rows;
  const edited_column = (cell: number): number => cell % REMOTE_NUMBER_COLUMNS;
  let generation = 0;
  let patches: DocumentOp[] = [];
  const samples_ms = collect(
    () => assert_applied(grid.applyTransaction({ patches }).status, "scattered edits"),
    {
      warmup: plan.warmup,
      iters: plan.iters,
      before: () => {
        generation += 1;
        patches = Array.from({ length: cells }, (_, cell) => ({
          op: "set" as const,
          addr: cell_address(edited_row(generation, cell), edited_column(cell)),
          value: { kind: "literal" as const, value: generation },
        }));
      },
    },
  );

  // Each checked row holds the last value and sums its columns A-H.
  for (const cell of [0, cells - 1]) {
    const row = edited_row(generation, cell);
    let sum = 0;
    for (let col = 0; col < REMOTE_NUMBER_COLUMNS; col += 1) {
      sum += Number(resolved_cell(grid, row, col));
    }
    if (
      resolved_cell(grid, row, edited_column(cell)) !== generation ||
      resolved_cell(grid, row, REMOTE_NUMBER_COLUMNS) !== sum
    ) {
      fail(`row ${row} does not sum the last scattered edit`);
    }
  }
  mounted.destroy();

  return scenario_result(
    "local-scattered-edits",
    `one transaction of ${cells} one-cell edits on scattered rows of a sheet of ${rows.toLocaleString("en-US")} SUM formulas`,
    samples_ms,
    { editedCells: cells, formulas: rows },
    "the first and last edited rows of the last transaction sum their new values",
  );
}

/**
 * New values for every linked workbook, applied as one `setExternalLinks`
 * change, as Edit Links' Update All does. Each link has one sheet of
 * `linkCells` cached values in column A; a formula reads each value, and every
 * row of the sheet also sums its own cells, so most formulas read no link.
 */
function refresh_external_links(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const rows = scale.linkRows;
  const book = (link: number): string => `Book${link}.xlsx`;
  const link_value = (generation: number, link: number, row: number): number =>
    generation * 100_000 + link * 1_000 + row;
  const links = (generation: number): ExternalLink[] =>
    Array.from({ length: scale.links }, (_, link) => ({
      book: book(link),
      target: `https://files.example/${book(link)}`,
      sheets: [
        {
          name: "Data",
          cells: Array.from({ length: scale.linkCells }, (_, row) => ({
            row,
            col: 0,
            value: link_value(generation, link, row),
          })),
        },
      ],
    }));
  const columns = number_columns(4);
  const mounted = mount_grid({
    workbook: { ...workbook(rows, columns), externalLinks: links(0) },
    transactionResourceLimits: { maxEncodedBytes: BLOCK_ENCODED_BYTES },
  });
  const { grid } = mounted;
  const readers = Math.min(rows, scale.links * scale.linkCells);
  const values = new Array<CellScalar>(rows * 4).fill(null);
  const formulas: Array<[number, string]> = [];
  for (let row = 0; row < rows; row += 1) {
    values[row * 4] = row;
    values[row * 4 + 1] = row * 2;
    formulas.push([row * 4 + 2, `=A${row + 1}+B${row + 1}`]);
    if (row < readers) {
      const source = `[${book(row % scale.links)}]Data!A${1 + Math.floor(row / scale.links)}`;
      formulas.push([row * 4 + 3, `=${source}*2`]);
    }
  }
  const block: PackedCellBlock = { rowCount: rows, colCount: 4, values, formulas };
  assert_applied(
    grid.applyTransaction({ patches: [{ op: "setBlock", range: sheet_range(rows, 4), block }] })
      .status,
    "linked-workbook sheet setup",
  );

  let generation = 0;
  let patch: DocumentOp = { op: "setExternalLinks", links: [] };
  const samples_ms = collect(
    () => assert_applied(grid.applyTransaction({ patches: [patch] }).status, "link refresh"),
    {
      warmup: plan.warmup,
      iters: plan.iters,
      before: () => {
        generation += 1;
        patch = { op: "setExternalLinks", links: links(generation) };
      },
    },
  );

  for (const row of [0, readers - 1]) {
    const expected = link_value(generation, row % scale.links, Math.floor(row / scale.links)) * 2;
    if (resolved_cell(grid, row, 3) !== expected) {
      fail(`row ${row} does not read the last link values`);
    }
  }
  mounted.destroy();

  return scenario_result(
    "external-links-refresh",
    `one change that gives ${scale.links} linked workbooks new values, read by ${readers.toLocaleString("en-US")} formulas`,
    samples_ms,
    { links: scale.links, linkCells: scale.links * scale.linkCells, formulas: rows + readers },
    "the first and last formulas that read a link show the last values",
  );
}

function rebase_block_across_inserts(
  scale: CorePathScale,
  plan: SamplePlan,
): CorePathScenarioResult {
  const block_start_row = 5_000;
  const block_range: Range = {
    sheet: SHEET,
    start: { row: block_start_row, col: 0 },
    end: { row: block_start_row + scale.rebaseBlockRows - 1, col: scale.rebaseBlockColumns - 1 },
  };
  const local_block = number_block(scale.rebaseBlockRows, scale.rebaseBlockColumns, 0);
  const local_operations: readonly DocumentOp[] = [
    { op: "setBlock", range: block_range, block: local_block },
  ];
  const source_values = local_block.values.slice();
  let generation = 0;
  let remote_operations: DocumentOp[] = [];
  let last_result: DocumentRebaseResult | undefined;
  const samples_ms = collect(
    () => {
      last_result = rebaseDocumentOperations(local_operations, remote_operations);
    },
    {
      warmup: plan.warmup,
      iters: plan.iters,
      before: () => {
        generation += 1;
        remote_operations = Array.from({ length: scale.rebaseInsertOperations }, (_, index) => ({
          op: "addRows" as const,
          sheet: SHEET,
          at: 200 + index * 2 + (generation % 3),
          count: 1,
        }));
      },
    },
  );

  const result = require_value(last_result, "rebase timed no result");
  if (result.status !== "rebased") {
    fail(`rebase of a non-overlapping block reported ${result.status}`);
  }
  const rebased = require_value(result.operations[0], "rebase returned no operation");
  if (rebased.op !== "setBlock") fail(`rebase returned ${rebased.op} instead of setBlock`);
  const shift = scale.rebaseInsertOperations;
  if (rebased.range.start.row !== block_range.start.row + shift) {
    fail(
      `rebased block starts at row ${rebased.range.start.row}, expected ${block_range.start.row + shift}`,
    );
  }
  if (rebased.range.end.row !== block_range.end.row + shift) {
    fail(
      `rebased block ends at row ${rebased.range.end.row}, expected ${block_range.end.row + shift}`,
    );
  }
  const block_cells = scale.rebaseBlockRows * scale.rebaseBlockColumns;
  if (
    rebased.block.values.length !== block_cells ||
    rebased.block.rowCount !== scale.rebaseBlockRows ||
    rebased.block.colCount !== scale.rebaseBlockColumns
  ) {
    fail("rebased block lost cells");
  }
  // Every rebased value must equal its source value, and the rebase must leave
  // both the caller's operation array and the block it owns untouched.
  const input = require_value(local_operations[0], "rebase input operation is missing");
  if (input.op !== "setBlock") fail(`rebase input operation is ${input.op}`);
  if (
    input.range.start.row !== block_range.start.row ||
    input.range.end.row !== block_range.end.row ||
    input.range.start.col !== block_range.start.col ||
    input.range.end.col !== block_range.end.col
  ) {
    fail("rebase modified its input range");
  }
  if (local_operations.length !== 1) fail("rebase changed the input operation count");
  for (let offset = 0; offset < block_cells; offset += 1) {
    if (rebased.block.values[offset] !== source_values[offset]) {
      fail(`rebased block value ${offset} does not match the source value`);
    }
    if (input.block.values[offset] !== source_values[offset]) {
      fail(`rebase modified its input block at offset ${offset}`);
    }
  }

  // Sync recovery rebases pending work only across remote cell edits; a
  // structural remote reloads instead. Time that path on the same block.
  let cell_result: DocumentRebaseResult | undefined;
  const cell_edit_samples_ms = collect(
    () => {
      cell_result = rebaseDocumentOperations(local_operations, remote_operations);
    },
    {
      warmup: plan.warmup,
      iters: plan.iters,
      before: () => {
        generation += 1;
        remote_operations = Array.from({ length: scale.rebaseInsertOperations }, (_, index) => ({
          op: "set" as const,
          addr: { sheet: SHEET, row: 200 + index * 2 + (generation % 3), col: 0 },
          value: { kind: "literal" as const, value: generation },
        }));
      },
    },
  );
  const cell_rebase = require_value(cell_result, "cell-edit rebase timed no result");
  if (cell_rebase.status !== "rebased") fail(`cell-edit rebase reported ${cell_rebase.status}`);
  const kept = require_value(cell_rebase.operations[0], "cell-edit rebase returned no operation");
  if (kept.op !== "setBlock" || kept.range.start.row !== block_range.start.row) {
    fail("cell-edit rebase moved the block");
  }
  for (let offset = 0; offset < block_cells; offset += 1) {
    if (kept.block.values[offset] !== source_values[offset]) {
      fail(`cell-edit rebase value ${offset} does not match the source value`);
    }
  }

  return scenario_result(
    "rebase-large",
    `one rebase of a ${block_cells.toLocaleString("en-US")}-cell block across ${shift} single-row inserts`,
    samples_ms,
    {
      blockCells: block_cells,
      insertOperations: shift,
      verifiedValues: block_cells,
      cellEditMedianMs: summarize(cell_edit_samples_ms).median,
    },
    "the block rebases without conflict, shifts down by exactly the inserted row count across the inserts and stays in place across the cell edits, keeps every source value, and leaves the caller's operations untouched",
    {
      variants: [
        variant("across-row-inserts", samples_ms),
        variant("across-cell-edits", cell_edit_samples_ms),
      ],
    },
  );
}

function write_sparse_range_with_rules(
  scale: CorePathScale,
  plan: SamplePlan,
): CorePathScenarioResult {
  const filled_rows = scale.sparseCells / SPARSE_COLUMNS;
  const range_rows = filled_rows * SPARSE_ROW_STRIDE;
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
  const mounted = mount_grid({
    workbook: workbook(SPARSE_RANGE_START_ROW + range_rows, number_columns(SPARSE_COLUMNS)),
    transactionResourceLimits: { maxEncodedBytes: BLOCK_ENCODED_BYTES },
  });
  const { grid } = mounted;
  for (const rule of rules) grid.setValidationRule(rule);

  const range = sheet_range(range_rows, SPARSE_COLUMNS, SPARSE_RANGE_START_ROW);
  const build_cells = (base: number): SnapshotCell[] => {
    const cells: SnapshotCell[] = [];
    for (let row = 0; row < filled_rows; row += 1) {
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
  const samples_ms = collect(
    () => {
      generation += 1;
      const result = grid.applyTransaction({
        patches: [{ op: "setRange", range, cells: build_cells(generation * scale.sparseCells) }],
      });
      assert_applied(result.status, "sparse setRange");
    },
    { warmup: plan.warmup, iters: plan.iters },
  );

  const expected = (plan.warmup + plan.iters) * scale.sparseCells;
  const probes = [0, Math.floor(scale.sparseCells / 2), scale.sparseCells - 1];
  for (const index of probes) {
    const row = SPARSE_RANGE_START_ROW + Math.floor(index / SPARSE_COLUMNS) * SPARSE_ROW_STRIDE;
    const col = index % SPARSE_COLUMNS;
    if (resolved_cell(grid, row, col) !== expected + index) {
      fail(`sparse setRange cell ${row}:${col} does not hold the last written value`);
    }
  }
  const stored_rules = grid.store.getWorkbook().sheets[0]?.validationRules?.length ?? 0;
  if (stored_rules !== scale.validationRules) {
    fail(`sheet holds ${stored_rules} validation rules, expected ${scale.validationRules}`);
  }
  const violated = grid.applyTransaction({
    patches: [{ op: "set", addr: cell_address(0, 0), value: { kind: "literal", value: 999 } }],
  });
  if (violated.status !== "rejected") {
    fail(`a value outside the rule bounds was ${violated.status} instead of rejected`);
  }
  if (!violated.issues.some((issue) => issue.kind === "validation")) {
    fail("the rejected write carries no validation issue");
  }
  mounted.destroy();

  return scenario_result(
    "validation-sparse",
    `one ${scale.sparseCells.toLocaleString("en-US")}-cell sparse setRange with ${scale.validationRules} rules outside the range`,
    samples_ms,
    {
      writtenCells: scale.sparseCells,
      logicalRangeCells: range_rows * SPARSE_COLUMNS,
      validationRules: scale.validationRules,
    },
    "every write is applied, probe cells hold the last written values, every rule is retained, and a rule violation is still rejected",
  );
}

function build_csv_text(rows: number, columns: number): string {
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

function import_csv_text(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const text = build_csv_text(scale.csvRows, scale.csvColumns);
  const columns: Column[] = Array.from({ length: scale.csvColumns }, (_, index) => ({
    key: column_key(index),
    header: `Header ${index + 1}`,
    width: 120,
    type: index % 2 === 0 ? "number" : "text",
  }));
  const options = { resourceLimits: CSV_RESOURCE_LIMITS };
  let last: ColumnarData | undefined;
  const samples_ms = collect(
    () => {
      last = fromCsv(text, columns, options);
    },
    { warmup: plan.warmup, iters: plan.iters, gcBetween: plan.gcBetween },
  );

  const data = require_value(last, "csv import timed no result");
  if (data.rowCount !== scale.csvRows) {
    fail(`csv import produced ${data.rowCount} rows, expected ${scale.csvRows}`);
  }
  // Every row and column is compared against the generator formula, so a wrong
  // parse, a shifted column, or a lost row fails instead of reporting a number.
  for (let col = 0; col < columns.length; col += 1) {
    const column = require_value(columns[col], `csv import lost column ${col}`);
    const source = require_value(data.columns[column.key], `csv import lost column ${column.key}`);
    const expected_column = col % 2 === 0;
    for (let row = 0; row < scale.csvRows; row += 1) {
      const expected = expected_column ? row * scale.csvColumns + col : `row-${row}-c${col}`;
      if (source[row] !== expected) {
        fail(
          `csv import cell ${row}:${col} is ${String(source[row])}, expected ${String(expected)}`,
        );
      }
    }
  }
  return scenario_result(
    "csv-import",
    `one fromCsv import of ${scale.csvRows.toLocaleString("en-US")} rows by ${scale.csvColumns} columns`,
    samples_ms,
    {
      importedRows: scale.csvRows,
      importedColumns: scale.csvColumns,
      verifiedCells: scale.csvRows * scale.csvColumns,
      inputChars: text.length,
    },
    "row count matches and every imported cell equals the source value for its row and column, including declared number/text types",
  );
}

// A repetitive 60 MiB decoded payload is valid under both restore ceilings.
// Encoding and initial sheet construction are deliberately outside the samples.
function restore_near_ceiling(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const rows = scale === FULL_SCALE ? 4_000 : 100;
  const columns = scale === FULL_SCALE ? 1_000 : 100;
  const value = "restore-text";
  const operation = encodeRestoreBlock(sheet_range(rows, columns), {
    rowCount: rows,
    colCount: columns,
    values: new Array<CellScalar>(rows * columns).fill(value),
  });
  const mounted = mount_grid({ workbook: workbook(rows, number_columns(columns)) });
  const samples_ms = collect(() => {
    assert_applied(mounted.grid.applyRemoteOperations([operation]).status, "restoreBlock");
  }, plan);
  if (resolved_cell(mounted.grid, rows - 1, columns - 1) !== value) {
    fail("near-ceiling restore did not apply the final cell");
  }
  mounted.destroy();
  return scenario_result(
    "restore-near-ceiling",
    `one restoreBlock with ${operation.decodedBytes} decoded bytes`,
    samples_ms,
    {
      restoredCells: rows * columns,
      decodedBytes: operation.decodedBytes,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    },
    "a valid near-ceiling compressed restore applies its complete block",
  );
}

function undo_large_clear(scale: CorePathScale, plan: SamplePlan): CorePathScenarioResult {
  const cell_count = scale.clearRows * scale.clearColumns;
  const data: ColumnarData = {
    rowCount: scale.clearRows,
    columns: Object.fromEntries(
      Array.from({ length: scale.clearColumns }, (_, col) => [
        column_key(col),
        Float64Array.from({ length: scale.clearRows }, (_, row) => row * scale.clearColumns + col),
      ]),
    ),
  };
  const mounted = mount_grid({
    workbook: workbook(scale.clearRows, number_columns(scale.clearColumns)),
    data,
  });
  const { grid } = mounted;
  let compact_restores = 0;
  grid.on("change", (event) => {
    if (event.commitReason === "undo") {
      compact_restores += event.transaction.patches.filter(
        (operation) => operation.op === "restoreBlock",
      ).length;
    }
  });
  const clear_operation: DocumentOp = {
    op: "clearRange",
    range: sheet_range(scale.clearRows, scale.clearColumns),
    contents: true,
    style: false,
  };
  const last_row = scale.clearRows - 1;
  const last_column = scale.clearColumns - 1;
  const expected_last = last_row * scale.clearColumns + last_column;

  assert_applied(grid.applyTransaction({ patches: [clear_operation] }).status, "clearRange");
  if (resolved_cell(grid, last_row, last_column) !== null) {
    fail("clearRange left contents behind");
  }
  grid.undo();
  if (resolved_cell(grid, last_row, last_column) !== expected_last) {
    fail("undo of a clearRange did not restore the cleared block");
  }

  let clears = 0;
  const samples_ms = collect(
    () => {
      grid.undo();
    },
    {
      warmup: plan.warmup,
      iters: plan.iters,
      gcBetween: plan.gcBetween,
      before: () => {
        clears += 1;
        assert_applied(grid.applyTransaction({ patches: [clear_operation] }).status, "clearRange");
      },
    },
  );

  // Every cell is compared against its original value after timing: a partial
  // restore fails here even though each undo returned normally.
  assert_windowed_values(grid, scale.clearRows, scale.clearColumns, 0, "undo restore");
  if (scale === FULL_SCALE && compact_restores === 0) fail("large-clear undo did not compact");
  mounted.destroy();

  return scenario_result(
    "undo-large-clear",
    `one undo of a ${cell_count.toLocaleString("en-US")}-cell clearRange`,
    samples_ms,
    {
      clearedCells: cell_count,
      clears,
      restoredCells: cell_count,
      compactRestores: compact_restores,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    },
    "the clear empties the block and the undos restore every original cell value",
  );
}

interface ColumnLoadProbe {
  areColumnsFullyLoaded(
    sheet: SheetId,
    startRow: number,
    endRow: number,
    columns: readonly number[],
  ): boolean;
}

async function revisit_evicted_band(
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
            const key = require_value(band.keys[index], "datasource band key");
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
  const mounted = mount_grid({
    workbook: workbook(scale.pagedRows, number_columns(PAGED_COLUMNS)),
    datasource,
    datasourceStorage: storage,
  });
  const { grid } = mounted;
  const probe = grid.store as typeof grid.store & ColumnLoadProbe;
  const fully_loaded = probe.areColumnsFullyLoaded.bind(probe);
  let fully_loaded_calls = 0;
  probe.areColumnsFullyLoaded = (sheet, start_row, end_row, requested) => {
    fully_loaded_calls += 1;
    return fully_loaded(sheet, start_row, end_row, requested);
  };

  const band_row = PAGED_BAND_ROW;
  const visit = async (row: number): Promise<void> => {
    grid.scrollToCell(cell_address(row, 0));
    await settle_async_work();
  };
  await visit(band_row);
  if (cell_load_state(grid, band_row, 0) !== "loaded-value") {
    fail("the first band did not load");
  }
  const expected_value = band_row + 1;
  if (resolved_cell(grid, band_row, 1) !== expected_value) {
    fail("the loaded band carries unexpected values");
  }

  const eviction_span = scale.pagedRows - PAGED_BAND_ROW - PAGED_CHUNK_ROWS * 3;
  let eviction_cursor = 0;
  const evict = async (): Promise<number> => {
    for (let attempt = 1; attempt <= PAGED_EVICTION_ATTEMPTS; attempt += 1) {
      // Walk away from the band in single-chunk steps and never restart the walk:
      // a walk that returns to rows near the band re-loads its chunks through
      // speculative prefetch, so the band never ages out of the cache.
      const step = eviction_cursor * PAGED_CHUNK_ROWS;
      const distant_row = PAGED_BAND_ROW + PAGED_CHUNK_ROWS * 2 + (step % eviction_span);
      eviction_cursor += 1;
      await visit(distant_row);
      if (cell_load_state(grid, band_row, 0) === "unloaded") return attempt;
    }
    return FAILED_EVICTION;
  };

  const samples_ms: number[] = [];
  let eviction_visits = 0;
  let revisit_calls = 0;
  for (let iteration = 0; iteration < plan.warmup + plan.iters; iteration += 1) {
    const attempts = await evict();
    if (attempts === FAILED_EVICTION) {
      fail(`the band was still loaded after ${PAGED_EVICTION_ATTEMPTS} distant visits`);
    }
    const calls_before = fully_loaded_calls;
    const started = now();
    await visit(band_row);
    const elapsed = now() - started;
    if (iteration >= plan.warmup) {
      samples_ms.push(elapsed);
      revisit_calls += fully_loaded_calls - calls_before;
      eviction_visits += attempts;
    }
    if (cell_load_state(grid, band_row, 0) !== "loaded-value") {
      fail("the revisiting round did not reload the evicted band");
    }
    if (resolved_cell(grid, band_row, 1) !== expected_value) {
      fail("the reloaded band carries unexpected values");
    }
  }
  mounted.destroy();

  return scenario_result(
    "paged-evicted-revisit",
    "one revisit of an evicted paged band: scroll back plus a fixed async settle floor (wall time is not the accept metric)",
    samples_ms,
    {
      revisitedRows: plan.iters,
      areColumnsFullyLoadedCalls: revisit_calls,
      evictionVisits: eviction_visits,
      pagedRows: scale.pagedRows,
    },
    "the band is unloaded before each revisit, the revisit reloads it with the source values, and the revisit asks areColumnsFullyLoaded at least once; areColumnsFullyLoadedCalls per revisit is the accept metric",
  );
}

const FAILED_EVICTION = -1;

/**
 * Runs in a fresh Node process. Core is imported before timing, as in an app;
 * the measured span is initSheetwrite() through first-store construction.
 * The heartbeat records event-loop stalls during that cold initialization:
 * the largest gap spans the load's start, every tick, and its end, so a load
 * that blocks the loop throughout reports zero ticks and its whole duration.
 */
const NODE_CHILD_PROGRAM = `
import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";

const ticks = [];
const heartbeat = setInterval(() => { ticks.push(performance.now()); }, ${NODE_HEARTBEAT_MS});

const startedAt = performance.now();
await initSheetwrite();
const workbook = {
  activeSheet: "s1",
  sheets: [{ id: "s1", name: "Core paths", rowCount: 4, columns: [{ key: "c0", header: "C0", width: 80, type: "number" }] }],
};
const store = new SheetwriteStore(workbook);
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

const applied = store.applyTransaction({
  patches: [{ op: "set", addr: { sheet: "s1", row: 0, col: 0 }, value: { kind: "literal", value: 42 } }],
});

process.stdout.write(JSON.stringify({
  loadMs,
  largestGapMs,
  loaded: true,
  heartbeatTicks: ticks.length,
  engineStatus: applied.status,
  engineValue: store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved,
  nodeVersion: process.version,
}));
`;

export interface NodeLoadSample {
  readonly loadMs: number;
  readonly largestGapMs: number;
  readonly loaded: boolean;
  readonly heartbeatTicks: number;
  readonly engineStatus: string;
  readonly engineValue: CellScalar;
  readonly nodeVersion: string;
}

function parse_node_load_sample(stdout: string, stderr: string, exit_code: number): NodeLoadSample {
  const line = stdout.trim();
  if (line.length === 0) {
    throw new Error(`node cold init produced no output (exit ${exit_code}): ${stderr.trim()}`);
  }
  const parsed: unknown = JSON.parse(line);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("node cold init output is not an object");
  }
  const record = parsed as Record<string, unknown>;
  const load_ms = record.loadMs;
  const largest_gap_ms = record.largestGapMs;
  const heartbeat_ticks = record.heartbeatTicks;
  if (
    typeof load_ms !== "number" ||
    typeof largest_gap_ms !== "number" ||
    typeof heartbeat_ticks !== "number" ||
    typeof record.nodeVersion !== "string" ||
    record.nodeVersion.length === 0
  ) {
    throw new Error("node cold init output is missing numbers or the runtime version");
  }
  return {
    loadMs: load_ms,
    largestGapMs: largest_gap_ms,
    loaded: record.loaded === true,
    heartbeatTicks: heartbeat_ticks,
    engineStatus: String(record.engineStatus),
    engineValue: record.engineValue as CellScalar,
    nodeVersion: record.nodeVersion,
  };
}

/**
 * Reject a fresh-process sample that did not load, computed the wrong value or
 * reported an impossible time. Zero heartbeat ticks is a valid observation: on
 * a fast machine the whole load can finish between two 1 ms ticks.
 */
export function checkNodeLoadSample(sample: NodeLoadSample): void {
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
}

async function load_wasm_in_fresh_node(plan: SamplePlan): Promise<CorePathScenarioResult> {
  const samples_ms: number[] = [];
  let largest_gap_ms = 0;
  let minimal_heartbeat_ticks = Number.POSITIVE_INFINITY;
  let node_version = "";
  for (let iteration = 0; iteration < plan.warmup + plan.iters; iteration += 1) {
    const child = Bun.spawn(["node", "--input-type=module", "-e", NODE_CHILD_PROGRAM], {
      cwd: BENCH_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exit_code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const sample = parse_node_load_sample(stdout, stderr, exit_code);
    checkNodeLoadSample(sample);
    if (node_version.length === 0) node_version = sample.nodeVersion;
    else if (node_version !== sample.nodeVersion) {
      fail(`the fresh Node processes disagree on their runtime version`);
    }
    largest_gap_ms = Math.max(largest_gap_ms, sample.largestGapMs);
    minimal_heartbeat_ticks = Math.min(minimal_heartbeat_ticks, sample.heartbeatTicks);
    if (iteration >= plan.warmup) samples_ms.push(sample.loadMs);
  }
  return scenario_result(
    "node-cold-init",
    `one cold initSheetwrite() through first store in a fresh Node process (${
      plan.warmup + plan.iters
    } processes)`,
    samples_ms,
    {
      largestHeartbeatGapMs: largest_gap_ms,
      minimalHeartbeatTicks: minimal_heartbeat_ticks,
      freshProcesses: plan.warmup + plan.iters,
    },
    "every fresh process loads the module, produces the expected engine result, and reports a plausible heartbeat gap",
    { observations: { nodeVersion: node_version } },
  );
}

/**
 * Drag the first row's lower border down through pointer events, as a user
 * does: every move previews the height and the release commits one
 * `setRowMeta`. The sheet has no other resized row, so every commit is the
 * sheet's first height override. Variants time the undo of that commit and the
 * same drag ended by `pointercancel`, which must restore the previewed row.
 * Garbage from one phase is collected before the next one starts, so a phase
 * pays only for its own allocations.
 * The counter is the backing store a standalone row index keeps after its
 * first resize at this sheet size.
 */
function resize_first_row(id: RowResizeScenarioId, plan: SamplePlan): CorePathScenarioResult {
  const rows = ROW_RESIZE_ROWS[id];
  const host = document.createElement("div");
  // happy-dom has no layout: give the viewport room for the first row.
  Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 400 } });
  document.body.appendChild(host);
  const book = workbook(rows, number_columns(2));
  const grid = createGrid(host, {
    workbook: book,
    config: { toolbar: false, tabs: false, find: false, contextMenu: false },
  });
  const scroller = host.querySelector(".sheetwrite-scroller");
  const border_y = DEFAULT_THEME.headerHeight + DEFAULT_THEME.rowHeight;
  const resized_height = DEFAULT_THEME.rowHeight + ROW_RESIZE_DRAG_STEPS;
  const first_row_height = (): number | undefined => book.sheets[0]?.rowHeights?.get(0);
  const commit_ms: number[] = [];
  const undo_ms: number[] = [];
  const cancel_ms: number[] = [];
  try {
    if (!(scroller instanceof HTMLElement)) fail(`${id} found no grid scroller`);
    const pointer = (type: string, y: number): void => {
      scroller.dispatchEvent(
        new PointerEvent(type, { clientX: 10, clientY: y, pointerId: 1, button: 0, bubbles: true }),
      );
    };
    const drag = (release: "pointerup" | "pointercancel"): void => {
      pointer("pointerdown", border_y);
      for (let step = 1; step <= ROW_RESIZE_DRAG_STEPS; step += 1) {
        pointer("pointermove", border_y + step);
      }
      pointer(release, border_y + ROW_RESIZE_DRAG_STEPS);
    };
    for (let iteration = 0; iteration < plan.warmup + plan.iters; iteration += 1) {
      if (plan.gcBetween) forceGc();
      let started = now();
      drag("pointerup");
      const committed = now() - started;
      if (first_row_height() !== resized_height) {
        fail(
          `${id} drag committed height ${String(first_row_height())}, expected ${resized_height}`,
        );
      }
      if (plan.gcBetween) forceGc();
      started = now();
      grid.undo();
      const undone = now() - started;
      if (first_row_height() !== undefined) fail(`${id} undo kept the first row's height`);
      if (plan.gcBetween) forceGc();
      started = now();
      drag("pointercancel");
      const cancelled = now() - started;
      if (first_row_height() !== undefined) fail(`${id} cancelled drag committed a height`);
      if (iteration >= plan.warmup) {
        commit_ms.push(committed);
        undo_ms.push(undone);
        cancel_ms.push(cancelled);
      }
    }
  } finally {
    grid.destroy();
    host.remove();
  }

  const index = new OffsetIndex(rows, DEFAULT_THEME.rowHeight);
  index.setHeight(0, resized_height);
  if (index.offsetOf(rows) !== rows * DEFAULT_THEME.rowHeight + ROW_RESIZE_DRAG_STEPS) {
    fail(`${id} row index total disagrees with one resized row`);
  }
  return scenario_result(
    id,
    `one ${ROW_RESIZE_DRAG_STEPS}-move drag of row 1's border, released to commit, on a ${rows.toLocaleString("en-US")}-row sheet`,
    commit_ms,
    {
      rows,
      dragSteps: ROW_RESIZE_DRAG_STEPS,
      rowIndexBytesAfterFirstResize: index.backingStoreBytes,
    },
    `each drag commits row 1 at ${resized_height} px, its undo removes the height, and a cancelled drag commits nothing`,
    {
      variants: [
        variant("drag-commit", commit_ms),
        variant("undo", undo_ms),
        variant("drag-cancel", cancel_ms),
      ],
    },
  );
}

export const CORE_PATH_SCENARIO_RUNNERS: Readonly<
  Record<
    CorePathScenarioId,
    (
      scale: CorePathScale,
      plan: SamplePlan,
    ) => Promise<CorePathScenarioResult> | CorePathScenarioResult
  >
> = {
  "row-bridge-insert": project_rows_into_bridge,
  "command-state-select": select_with_command_state,
  "setblock-admission": (scale, plan) => apply_one_block(scale, plan, false),
  "setblock-detailed-capture": (scale, plan) => apply_one_block(scale, plan, true),
  "sync-offline-queue": queue_offline_commits,
  "sync-remote-versions": apply_remote_versions,
  "local-scattered-edits": apply_scattered_edits,
  "external-links-refresh": refresh_external_links,
  "rebase-large": rebase_block_across_inserts,
  "validation-sparse": write_sparse_range_with_rules,
  "csv-import": import_csv_text,
  "undo-large-clear": undo_large_clear,
  "restore-near-ceiling": restore_near_ceiling,
  "paged-evicted-revisit": revisit_evicted_band,
  "node-cold-init": (_scale, plan) => load_wasm_in_fresh_node(plan),
  "row-resize-100": (_scale, plan) => resize_first_row("row-resize-100", plan),
  "row-resize-100k": (_scale, plan) => resize_first_row("row-resize-100k", plan),
  "row-resize-1m": (_scale, plan) => resize_first_row("row-resize-1m", plan),
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
  await initSheetwrite({ source: bytes });
  const memory = getEngine().getMemory();

  const restore_canvas = installCanvasTestStubs();
  const original_request_animation_frame = globalThis.requestAnimationFrame;
  const original_cancel_animation_frame = globalThis.cancelAnimationFrame;

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
      const plan = sample_plan(id, mode);

      forceGc();
      scenarios.push(await CORE_PATH_SCENARIO_RUNNERS[id](scale, plan));
      forceGc();
    }
  } finally {
    globalThis.requestAnimationFrame = original_request_animation_frame;
    globalThis.cancelAnimationFrame = original_cancel_animation_frame;
    restore_canvas();
  }

  const node_loader_version = scenarios.find((scenario) => scenario.id === "node-cold-init")
    ?.observations?.nodeVersion;
  const artifact: CorePathsBenchmarkArtifact = {
    schemaVersion: CORE_PATHS_BENCHMARK_SCHEMA_VERSION,
    protocol: PROTOCOL,
    mode,
    metadata: protocolCaptureMeta(),
    toolchain: {
      bun: Bun.version,
      nodeCompat: process.version,
      ...(node_loader_version === undefined ? {} : { nodeLoader: node_loader_version }),
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

  if (memory.buffer.byteLength <= 0) fail("core's engine exposes no memory");
  validateCorePathsBenchmark(artifact, mode, scenarioIds);

  return artifact;
}

function parse_scenario_ids(value: string | undefined): readonly CorePathScenarioId[] {
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

function report_table(scenarios: readonly CorePathScenarioResult[]): string {
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
    parse_scenario_ids(optionValue(args, "--scenario")),
  );
  process.stdout.write(`${report_table(artifact.scenarios)}\n`);
  const output = optionValue(args, "--output");
  if (output !== undefined) await Bun.write(output, `${JSON.stringify(artifact, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(artifact)}\n`);
}
