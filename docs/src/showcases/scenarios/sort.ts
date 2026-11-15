import {
  formatNumber,
  type CellAddress,
  type CommitReason,
  type DocumentOp,
  type Grid,
  type Range,
  type SortKey,
  type Workbook,
} from "@sheetwrite/core";

import type { LiveScenario } from "./live-scenario.js";
import { createListeners, mountShowcaseShell, requireApplied } from "./showcase-shell.js";

// The sort showcase: 40 orders whose revenue is a formula, and a Watch sheet
// whose formulas read row 1 of the orders. An in-place sort moves the cells,
// so the Watch formulas see a new first order; a view sort only reorders what
// the grid shows, so they do not.

export const ORDERS_SHEET = "orders";
export const WATCH_SHEET = "watch";
export const ORDER_COUNT = 40;

const REGIONS = ["Americas", "APAC", "EMEA", "LATAM"] as const;
const REPS = ["Ana Ruiz", "Ben Okafor", "Chen Wei", "Dana Holt", "Eli Moreau", "Fay Lindqvist"];
const REVENUE_FORMAT = "$#,##0";

/** Order columns in sheet order; each index is its column in formulas and sort keys. */
const ORDER_COLUMNS = [
  { key: "order", header: "Order", width: 104, type: "text" },
  { key: "region", header: "Region", width: 104, type: "text" },
  { key: "rep", header: "Rep", width: 132, type: "text" },
  { key: "units", header: "Units", width: 80, type: "number", numberFormat: "#,##0" },
  { key: "price", header: "Unit price", width: 104, type: "number", numberFormat: "$#,##0.00" },
  { key: "revenue", header: "Revenue", width: 112, type: "number", numberFormat: REVENUE_FORMAT },
] as const;

type OrderColumnKey = (typeof ORDER_COLUMNS)[number]["key"];

/** The column index of an order field. */
export const column = (key: OrderColumnKey): number =>
  ORDER_COLUMNS.findIndex((candidate) => candidate.key === key);

/** The header of an order column, for labels. */
export const columnHeader = (col: number): string => ORDER_COLUMNS[col]?.header ?? `Column ${col}`;

/** The whole order list: the range every in-place sort here rewrites. */
export const ORDERS_RANGE: Range = {
  sheet: ORDERS_SHEET,
  start: { row: 0, col: 0 },
  end: { row: ORDER_COUNT - 1, col: ORDER_COLUMNS.length - 1 },
};

/** The two sorts the controls offer; each runs in place or as a view sort. */
export const SORTS = {
  revenue: {
    label: "Revenue, largest first",
    keys: [{ col: column("revenue"), ascending: false }],
  },
  region: {
    label: "Region A–Z, then revenue",
    keys: [
      { col: column("region"), ascending: true },
      { col: column("revenue"), ascending: false },
    ],
  },
} as const satisfies Record<string, { label: string; keys: readonly SortKey[] }>;

export type SortId = keyof typeof SORTS;

/** Watch formulas, one per row of the Watch sheet: they read the orders by position. */
const WATCH = [
  { label: "Order in row 1", src: "=Orders!A1" },
  { label: "Revenue in row 1", src: "=Orders!F1" },
  {
    label: "Largest order",
    src: `=INDEX(Orders!A1:A${ORDER_COUNT},MATCH(MAX(Orders!F1:F${ORDER_COUNT}),Orders!F1:F${ORDER_COUNT},0))`,
  },
] as const;

/** Formulas in the workbook: one revenue formula per order, plus the Watch formulas. */
export const FORMULA_COUNT = ORDER_COUNT + WATCH.length;

function sortWorkbook(): Workbook {
  return {
    activeSheet: ORDERS_SHEET,
    sheets: [
      {
        id: ORDERS_SHEET,
        name: "Orders",
        rowCount: ORDER_COUNT,
        columns: ORDER_COLUMNS.map((entry) => ({ ...entry })),
      },
      {
        id: WATCH_SHEET,
        name: "Watch",
        rowCount: WATCH.length,
        columns: [
          { key: "label", header: "Reads", width: 160, type: "text" },
          { key: "value", header: "Value", width: 120, type: "text" },
        ],
      },
    ],
  };
}

/** A deterministic order list: values, plus a revenue formula in every row. */
function orderOperations(): DocumentOp[] {
  const set = (sheet: string, row: number, col: number, value: string | number): DocumentOp => ({
    op: "set",
    addr: { sheet, row, col },
    value: { kind: "literal", value },
  });
  const formula = (sheet: string, row: number, col: number, src: string): DocumentOp => ({
    op: "set",
    addr: { sheet, row, col },
    value: { kind: "formula", src },
  });
  const operations: DocumentOp[] = [];
  for (let row = 0; row < ORDER_COUNT; row++) {
    // Formula rows are 1-based: data row `row` is row `row + 1`.
    const line = row + 1;
    operations.push(
      set(ORDERS_SHEET, row, column("order"), `ORD-${1001 + row}`),
      set(ORDERS_SHEET, row, column("region"), REGIONS[(row * 7) % REGIONS.length] ?? "EMEA"),
      set(ORDERS_SHEET, row, column("rep"), REPS[(row * 5) % REPS.length] ?? "Ana Ruiz"),
      set(ORDERS_SHEET, row, column("units"), 4 + ((row * 37) % 61)),
      set(ORDERS_SHEET, row, column("price"), 18 + ((row * 29) % 23) * 4.5),
      formula(ORDERS_SHEET, row, column("revenue"), `=D${line}*E${line}`),
    );
  }
  WATCH.forEach((watch, row) => {
    operations.push(set(WATCH_SHEET, row, 0, watch.label), formula(WATCH_SHEET, row, 1, watch.src));
  });
  return operations;
}

export interface WatchReading {
  readonly label: string;
  readonly formula: string;
  readonly value: string;
}

export interface SortSnapshot {
  /** What the Watch formulas read now. */
  readonly watch: readonly WatchReading[];
  /** Orders whose cells are on another row than at the start. */
  readonly movedRows: number;
  /** The view sort keys of the Orders sheet, as labels. */
  readonly viewSort: string | null;
  /** The commit reason of the last change, such as `sort` for an in-place sort. */
  readonly lastReason: CommitReason | null;
}

export interface SortScenario extends LiveScenario<SortSnapshot> {
  sortInPlace(id: SortId): void;
  sortView(id: SortId): void;
  clearViewSort(): void;
  /** Open the Sort panel over the order list, as Data › Custom Sort does. */
  openSortPanel(): void;
  undo(): void;
}

function keyLabel(keys: readonly SortKey[]): string {
  return keys
    .map((key) => `${columnHeader(key.col)} ${key.ascending ? "A–Z" : "Z–A"}`)
    .join(", then ");
}

function readText(grid: Grid, addr: CellAddress, format?: string): string {
  const value = grid.store.getCell(addr).resolved;
  if (value === null) return "";
  return typeof value === "number" && format ? formatNumber(value, format) : String(value);
}

/** Mount the order list and the Watch sheet, then sort them through the public Grid API. */
export function createSortScenario(host: HTMLElement): SortScenario {
  const controller = new AbortController();
  const listeners = createListeners();
  let grid: Grid | null = null;
  let dispose = () => {};
  let startOrder: readonly string[] = [];
  let lastReason: CommitReason | null = null;

  const orderAt = (row: number) =>
    grid ? readText(grid, { sheet: ORDERS_SHEET, row, col: column("order") }) : "";

  const ready = (async () => {
    // Column names in the headers: a view sort orders every row, so no header row sits in the cells.
    const shell = await mountShowcaseShell(
      host,
      { workbook: sortWorkbook(), presentation: "data-grid" },
      controller.signal,
    );
    if (!shell) return;
    grid = shell.grid;
    // Seed the document as a host load: it is not an undo step.
    requireApplied(grid.applyRemoteOperations(orderOperations()), "The order list");
    startOrder = Array.from({ length: ORDER_COUNT }, (_, row) => orderAt(row));
    const stopChanges = grid.on("change", (event) => {
      lastReason = event.commitReason;
      listeners.notify();
    });
    grid.setSelection({ kind: "cell", addr: { sheet: ORDERS_SHEET, row: 0, col: 0 } });
    dispose = () => {
      stopChanges();
      shell.dispose();
    };
  })();

  const requireGrid = (): Grid => {
    if (!grid) throw new Error("The order list is still loading");
    return grid;
  };

  return {
    ready,
    subscribe: listeners.subscribe,
    snapshot() {
      const current = grid;
      if (!current) return { watch: [], movedRows: 0, viewSort: null, lastReason: null };
      const keys =
        current.store.getWorkbook().sheets.find((sheet) => sheet.id === ORDERS_SHEET)?.sortKeys ??
        [];
      return {
        watch: WATCH.map((watch, row) => ({
          label: watch.label,
          formula: watch.src,
          value: readText(
            current,
            { sheet: WATCH_SHEET, row, col: 1 },
            row === 1 ? REVENUE_FORMAT : undefined,
          ),
        })),
        movedRows: startOrder.filter((order, row) => orderAt(row) !== order).length,
        viewSort: keys.length > 0 ? keyLabel(keys) : null,
        lastReason,
      };
    },
    sortInPlace(id) {
      requireApplied(
        requireGrid().sortRange(ORDERS_RANGE, SORTS[id].keys),
        `Sort by ${SORTS[id].label}`,
      );
    },
    sortView(id) {
      requireApplied(requireGrid().setViewSort(SORTS[id].keys), `View sort ${SORTS[id].label}`);
    },
    clearViewSort() {
      requireApplied(requireGrid().setViewSort([]), "Clear the view sort");
    },
    openSortPanel() {
      const current = requireGrid();
      current.setActiveSheet(ORDERS_SHEET);
      current.setSelection({ kind: "range", range: ORDERS_RANGE });
      current.actions.customSort();
    },
    undo() {
      requireGrid().undo();
    },
    dispose() {
      controller.abort();
      dispose();
      grid = null;
    },
  };
}
