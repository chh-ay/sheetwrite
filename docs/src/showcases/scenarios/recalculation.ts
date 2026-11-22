import {
  colToA1,
  type CellScalar,
  type CellValue,
  type DocumentOp,
  type Grid,
  type Workbook,
} from "@sheetwrite/core";

import type { LiveScenario } from "./live-scenario.js";
import { createListeners, mountShowcaseShell, requireApplied } from "./showcase-shell.js";

// The recalculation showcase: 100,000 order rows whose revenue formulas all
// read one price-change cell, and 1,000 XLOOKUP formulas that search the
// 100,000 SKUs. The page edits a control cell through the public API and
// measures, in this browser, how long the engine takes to recalculate and the
// grid to paint. The grid mounts empty, and the rows arrive in blocks with a
// yield between them, so loading never blocks the page for long.

export const MODEL_SHEET = "model";
export const ROWS = 100_000;
export const LOOKUPS = 1_000;
/** Revenue formulas, their total, the lookups and the lookup total. */
export const FORMULA_COUNT = ROWS + 1 + LOOKUPS + 1;
/** The most recent runs the side panel lists. */
export const RUN_HISTORY = 8;
/** How many edits "Run a series" makes in a row. */
export const SERIES_LENGTH = 10;
/** How far each "move the lookups" press shifts the first SKU looked up. */
const LOOKUP_STEP = 7_000;
/** Order rows set and calculated per load step: one short task each. */
const LOAD_BATCH = 5_000;

const SKU = (index: number) => `SKU-${String(index + 1).padStart(6, "0")}`;

/** Control cells: a label in the Control column and its value or formula beside it. */
const CONTROLS = {
  priceChange: { row: 0, label: "Price change" },
  revenue: { row: 1, label: "Total revenue" },
  lookupStart: { row: 2, label: "First SKU looked up" },
  lookupTotal: { row: 3, label: "Looked-up prices" },
} as const;

const COLUMNS = [
  { key: "sku", header: "SKU", width: 112, type: "text" },
  { key: "price", header: "Price", width: 88, type: "number", numberFormat: "$#,##0.00" },
  { key: "units", header: "Units", width: 72, type: "number" },
  { key: "revenue", header: "Revenue", width: 112, type: "number", numberFormat: "$#,##0.00" },
  { key: "lookup", header: "Looked up", width: 104, type: "number", numberFormat: "$#,##0.00" },
  { key: "control", header: "Control", width: 152, type: "text" },
  { key: "value", header: "Value", width: 120, type: "number" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];
const column_index = (key: ColumnKey) => COLUMNS.findIndex((column) => column.key === key);
/** The column letter of a model column, for formulas. */
const letter = (key: ColumnKey) => colToA1(column_index(key));
const LABEL_COL = column_index("control");
export const VALUE_COL = column_index("value");
/** The price-change cell every revenue formula reads, as an absolute reference. */
export const PRICE_CHANGE_CELL = `$${letter("value")}$${CONTROLS.priceChange.row + 1}`;

/** The order columns, from SKU to Revenue, that each load block fills. */
const ORDER_COLUMNS = ["sku", "price", "units", "revenue"] as const satisfies readonly ColumnKey[];

type BlockOperation = Extract<DocumentOp, { op: "setBlock" }>;

/**
 * Rows `start` to `end` of the order columns as one packed block: the values
 * row by row, and the revenue cell of each row as a formula.
 */
function order_block(start: number, end: number): BlockOperation {
  const [price_col, units_col] = [letter("price"), letter("units")];
  const width = ORDER_COLUMNS.length;
  const revenue = ORDER_COLUMNS.indexOf("revenue");
  const values: CellScalar[] = new Array((end - start) * width).fill(null);
  const formulas: [offset: number, source: string][] = [];
  for (let row = start; row < end; row++) {
    const offset = (row - start) * width;
    const line = row + 1;
    values[offset] = SKU(row);
    values[offset + 1] = 4 + ((row * 37) % 400) / 4;
    values[offset + 2] = 1 + ((row * 13) % 40);
    formulas.push([
      offset + revenue,
      `=${price_col}${line}*${units_col}${line}*(1+${PRICE_CHANGE_CELL})`,
    ]);
  }
  return {
    op: "setBlock",
    range: {
      sheet: MODEL_SHEET,
      start: { row: start, col: column_index(ORDER_COLUMNS[0]) },
      end: { row: end - 1, col: column_index("revenue") },
    },
    block: { rowCount: end - start, colCount: width, values, formulas },
  };
}

/** The 1,000 XLOOKUP formulas, as one packed block of the Looked up column. */
function lookup_block(): BlockOperation {
  const [sku_col, price_col] = [letter("sku"), letter("price")];
  const lookup_start = `$${letter("value")}$${CONTROLS.lookupStart.row + 1}`;
  const formulas: [offset: number, source: string][] = [];
  for (let row = 0; row < LOOKUPS; row++) {
    formulas.push([
      row,
      `=XLOOKUP("SKU-"&TEXT(${lookup_start}+${row},"000000"),$${sku_col}$1:$${sku_col}$${ROWS},$${price_col}$1:$${price_col}$${ROWS})`,
    ]);
  }
  const col = column_index("lookup");
  return {
    op: "setBlock",
    range: { sheet: MODEL_SHEET, start: { row: 0, col }, end: { row: LOOKUPS - 1, col } },
    block: { rowCount: LOOKUPS, colCount: 1, values: new Array(LOOKUPS).fill(null), formulas },
  };
}

/** The order rows `LOAD_BATCH` at a time, then the lookups. */
function* model_blocks(): Generator<BlockOperation> {
  for (let start = 0; start < ROWS; start += LOAD_BATCH) {
    yield order_block(start, Math.min(start + LOAD_BATCH, ROWS));
  }
  yield lookup_block();
}

function control_operations(): DocumentOp[] {
  const cell = (row: number, col: number, value: CellValue): DocumentOp => ({
    op: "set",
    addr: { sheet: MODEL_SHEET, row, col },
    value,
  });
  const revenue_col = letter("revenue");
  const lookup_col = letter("lookup");
  return [
    ...Object.values(CONTROLS).map((control) =>
      cell(control.row, LABEL_COL, { kind: "literal", value: control.label }),
    ),
    cell(CONTROLS.priceChange.row, VALUE_COL, { kind: "literal", value: 0 }),
    cell(CONTROLS.revenue.row, VALUE_COL, {
      kind: "formula",
      src: `=SUM(${revenue_col}1:${revenue_col}${ROWS})`,
    }),
    cell(CONTROLS.lookupStart.row, VALUE_COL, { kind: "literal", value: 1 }),
    cell(CONTROLS.lookupTotal.row, VALUE_COL, {
      kind: "formula",
      src: `=SUM(${lookup_col}1:${lookup_col}${LOOKUPS})`,
    }),
  ];
}

function model_workbook(): Workbook {
  return {
    activeSheet: MODEL_SHEET,
    sheets: [
      {
        id: MODEL_SHEET,
        name: "Model",
        rowCount: ROWS,
        columns: COLUMNS.map((column) => ({ ...column })),
      },
    ],
  };
}

export type RunKind = "fan-out" | "lookups";

/** One measured edit: the engine's part and the paint after it. */
export interface MeasuredRun {
  readonly id: number;
  readonly kind: RunKind;
  /** From the edit call until the results were readable. */
  readonly recalcMs: number;
  /** From the results until the next frame was painted. */
  readonly paintMs: number;
}

export interface RecalculationSnapshot {
  /** Loading the engine, creating the grid with every row and calculating every formula once. */
  readonly firstCalculationMs: number | null;
  /** Formulas set and calculated so far while the model loads. */
  readonly loadedFormulas: number;
  readonly runs: readonly MeasuredRun[];
  readonly revenue: CellScalar;
  readonly lookupTotal: CellScalar;
  readonly running: boolean;
}

export interface RecalculationScenario extends LiveScenario<RecalculationSnapshot> {
  /** Change the price-change cell that all 100,000 revenue formulas read. */
  changePrices(): Promise<void>;
  /** Move the 1,000 lookups to other SKUs. */
  moveLookups(): Promise<void>;
  /** Make `SERIES_LENGTH` price changes in a row. */
  runSeries(): Promise<void>;
}

/** Resolves after the browser painted the frame that follows the edit. */
function next_paint(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  return promise;
}

/** Resolves in a new task, so input and paint run before the next load batch. */
function next_task(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The median of measured times, for a series. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Mount the 100,000-row model, then measure each edit through the public Grid API. */
export function createRecalculationScenario(host: HTMLElement): RecalculationScenario {
  const controller = new AbortController();
  const listeners = createListeners();
  let grid: Grid | null = null;
  let dispose = () => {};
  let loaded_formulas = 0;
  let first_calculation_ms: number | null = null;
  let runs: MeasuredRun[] = [];
  let next_run = 1;
  let price_change = 0;
  let lookup_start = 1;
  let running = false;

  const read = (row: number): CellScalar =>
    grid?.store.getCell({ sheet: MODEL_SHEET, row, col: VALUE_COL }).resolved ?? null;

  const ready = (async () => {
    const started = performance.now();
    const shell = await mountShowcaseShell(
      host,
      { workbook: model_workbook(), presentation: "data-grid" },
      controller.signal,
    );
    if (!shell) return;
    grid = shell.grid;
    dispose = () => shell.dispose();
    requireApplied(grid.applyRemoteOperations(control_operations()), "The control cells");
    // Each block is set, then calculated by reading the totals that depend on it.
    for (const block of model_blocks()) {
      await next_task();
      if (controller.signal.aborted) return;
      requireApplied(grid.applyRemoteOperations([block]), "The model rows");
      read(CONTROLS.revenue.row);
      read(CONTROLS.lookupTotal.row);
      loaded_formulas += block.block.formulas?.length ?? 0;
      listeners.notify();
    }
    // The two totals in the Value column are formulas too.
    loaded_formulas += 2;
    first_calculation_ms = performance.now() - started;
    const stop_changes = grid.on("change", () => listeners.notify());
    dispose = () => {
      stop_changes();
      shell.dispose();
    };
  })();

  /** Set one control cell and time the engine, then the paint. */
  const measure = async (kind: RunKind, row: number, value: number) => {
    const current = grid;
    if (!current) throw new Error("The model is still loading");
    const started = performance.now();
    requireApplied(
      current.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: MODEL_SHEET, row, col: VALUE_COL },
            value: { kind: "literal", value },
          },
        ],
      }),
      "The edit",
    );
    // Reading a dependent result makes sure the recalculation it needs is done.
    read(kind === "fan-out" ? CONTROLS.revenue.row : CONTROLS.lookupTotal.row);
    const recalculated = performance.now();
    await next_paint();
    const run: MeasuredRun = {
      id: next_run++,
      kind,
      recalcMs: recalculated - started,
      paintMs: performance.now() - recalculated,
    };
    runs = [run, ...runs].slice(0, RUN_HISTORY);
    listeners.notify();
  };

  const exclusive = async (work: () => Promise<void>) => {
    running = true;
    listeners.notify();
    try {
      await work();
    } finally {
      running = false;
      listeners.notify();
    }
  };

  const change_prices = () => {
    // Alternate between two rates so every press changes every revenue.
    price_change = price_change === 0.05 ? 0.1 : 0.05;
    return measure("fan-out", CONTROLS.priceChange.row, price_change);
  };

  return {
    ready,
    subscribe: listeners.subscribe,
    snapshot: () => ({
      firstCalculationMs: first_calculation_ms,
      loadedFormulas: loaded_formulas,
      runs,
      // While the formulas load, the totals are partial sums.
      revenue: first_calculation_ms === null ? null : read(CONTROLS.revenue.row),
      lookupTotal: first_calculation_ms === null ? null : read(CONTROLS.lookupTotal.row),
      running,
    }),
    changePrices: () => exclusive(change_prices),
    moveLookups: () =>
      exclusive(() => {
        // A block of SKUs far from the last one, wrapping before the list ends.
        lookup_start = ((lookup_start - 1 + LOOKUP_STEP) % (ROWS - LOOKUPS)) + 1;
        return measure("lookups", CONTROLS.lookupStart.row, lookup_start);
      }),
    runSeries: () =>
      exclusive(async () => {
        for (let index = 0; index < SERIES_LENGTH; index++) await change_prices();
      }),
    dispose() {
      controller.abort();
      dispose();
      grid = null;
    },
  };
}
