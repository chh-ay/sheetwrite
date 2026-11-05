import {
  colToA1,
  type CellScalar,
  type CellValue,
  type ColumnarData,
  type DocumentOp,
  type Grid,
  type Workbook,
} from "@sheetwrite/core";

import type { LiveScenario } from "../use-live-scenario.js";
import { createListeners, mountShowcaseShell, requireApplied } from "./showcase-shell.js";

// The recalculation showcase: 100,000 order rows whose revenue formulas all
// read one price-change cell, and 1,000 XLOOKUP formulas that search the
// 100,000 SKUs. The page edits a control cell through the public API and
// measures, in this browser, how long the engine takes to recalculate and the
// grid to paint.

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
const columnIndex = (key: ColumnKey) => COLUMNS.findIndex((column) => column.key === key);
/** The column letter of a model column, for formulas. */
const letter = (key: ColumnKey) => colToA1(columnIndex(key));
const LABEL_COL = columnIndex("control");
export const VALUE_COL = columnIndex("value");
/** The price-change cell every revenue formula reads, as an absolute reference. */
export const PRICE_CHANGE_CELL = `$${letter("value")}$${CONTROLS.priceChange.row + 1}`;

function modelData(): ColumnarData {
  const sku: CellScalar[] = new Array(ROWS);
  const price = new Float64Array(ROWS);
  const units = new Float64Array(ROWS);
  const revenue: CellValue[] = new Array(ROWS);
  const lookup: (CellValue | null)[] = new Array(ROWS).fill(null);
  const [skuCol, priceCol, unitsCol] = [letter("sku"), letter("price"), letter("units")];
  const lookupStart = `$${letter("value")}$${CONTROLS.lookupStart.row + 1}`;
  for (let index = 0; index < ROWS; index++) {
    const line = index + 1;
    sku[index] = SKU(index);
    price[index] = 4 + ((index * 37) % 400) / 4;
    units[index] = 1 + ((index * 13) % 40);
    revenue[index] = {
      kind: "formula",
      src: `=${priceCol}${line}*${unitsCol}${line}*(1+${PRICE_CHANGE_CELL})`,
    };
  }
  for (let index = 0; index < LOOKUPS; index++) {
    lookup[index] = {
      kind: "formula",
      src: `=XLOOKUP("SKU-"&TEXT(${lookupStart}+${index},"000000"),$${skuCol}$1:$${skuCol}$${ROWS},$${priceCol}$1:$${priceCol}$${ROWS})`,
    };
  }
  const empty = new Array(ROWS).fill(null);
  return {
    rowCount: ROWS,
    columns: { sku, price, units, revenue, lookup, control: empty, value: empty },
  };
}

function controlOperations(): DocumentOp[] {
  const cell = (row: number, col: number, value: CellValue): DocumentOp => ({
    op: "set",
    addr: { sheet: MODEL_SHEET, row, col },
    value,
  });
  const revenueCol = letter("revenue");
  const lookupCol = letter("lookup");
  return [
    ...Object.values(CONTROLS).map((control) =>
      cell(control.row, LABEL_COL, { kind: "literal", value: control.label }),
    ),
    cell(CONTROLS.priceChange.row, VALUE_COL, { kind: "literal", value: 0 }),
    cell(CONTROLS.revenue.row, VALUE_COL, {
      kind: "formula",
      src: `=SUM(${revenueCol}1:${revenueCol}${ROWS})`,
    }),
    cell(CONTROLS.lookupStart.row, VALUE_COL, { kind: "literal", value: 1 }),
    cell(CONTROLS.lookupTotal.row, VALUE_COL, {
      kind: "formula",
      src: `=SUM(${lookupCol}1:${lookupCol}${LOOKUPS})`,
    }),
  ];
}

function modelWorkbook(): Workbook {
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
function nextPaint(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  return promise;
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
  let firstCalculationMs: number | null = null;
  let runs: MeasuredRun[] = [];
  let nextRun = 1;
  let priceChange = 0;
  let lookupStart = 1;
  let running = false;

  const read = (row: number): CellScalar =>
    grid?.store.getCell({ sheet: MODEL_SHEET, row, col: VALUE_COL }).resolved ?? null;

  const ready = (async () => {
    const data = modelData();
    const started = performance.now();
    const shell = await mountShowcaseShell(
      host,
      { workbook: modelWorkbook(), data, presentation: "data-grid" },
      controller.signal,
    );
    if (!shell) return;
    grid = shell.grid;
    requireApplied(grid.applyRemoteOperations(controlOperations()), "The control cells");
    read(CONTROLS.revenue.row);
    firstCalculationMs = performance.now() - started;
    const stopChanges = grid.on("change", () => listeners.notify());
    dispose = () => {
      stopChanges();
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
    await nextPaint();
    const run: MeasuredRun = {
      id: nextRun++,
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

  const changePrices = () => {
    // Alternate between two rates so every press changes every revenue.
    priceChange = priceChange === 0.05 ? 0.1 : 0.05;
    return measure("fan-out", CONTROLS.priceChange.row, priceChange);
  };

  return {
    ready,
    subscribe: listeners.subscribe,
    snapshot: () => ({
      firstCalculationMs,
      runs,
      revenue: read(CONTROLS.revenue.row),
      lookupTotal: read(CONTROLS.lookupTotal.row),
      running,
    }),
    changePrices: () => exclusive(changePrices),
    moveLookups: () =>
      exclusive(() => {
        // A block of SKUs far from the last one, wrapping before the list ends.
        lookupStart = ((lookupStart - 1 + LOOKUP_STEP) % (ROWS - LOOKUPS)) + 1;
        return measure("lookups", CONTROLS.lookupStart.row, lookupStart);
      }),
    runSeries: () =>
      exclusive(async () => {
        for (let index = 0; index < SERIES_LENGTH; index++) await changePrices();
      }),
    dispose() {
      controller.abort();
      dispose();
      grid = null;
    },
  };
}
