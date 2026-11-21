// The user's own workbook, as formula assist reads it beyond the cells next
// to the edit: the formulas of every visible sheet, counted by their shape.
// The add-on counts them in idle time after the grid mounts and keeps the
// count current from the store's change events. It lives in memory only, and
// it never reads hidden sheets.

import {
  type ChangeEvent,
  type DocumentOp,
  type SheetId,
  shiftA1Refs,
  type Store,
} from "@sheetwrite/core";

/**
 * The cell every formula is moved to for its shape: two formulas that a fill
 * or a paste turns into each other have the same text there. It sits in the
 * middle of the sheet, so the relative references of real formulas stay on it.
 */
const ANCHOR_ROW = 524_288;
const ANCHOR_COL = 8_192;

/** The shape of `formula` written in `row`, `col`: the formula moved to the anchor cell. */
export function shapeOf(formula: string, row: number, col: number): string {
  return shiftA1Refs(formula, ANCHOR_ROW - row, ANCHOR_COL - col);
}

/** The formula of `shape` written in `row`, `col`. */
export function formulaOf(shape: string, row: number, col: number): string {
  return shiftA1Refs(shape, row - ANCHOR_ROW, col - ANCHOR_COL);
}

/** Longer formulas are not counted: they are rare, and the limit bounds the memory. */
const MAX_FORMULA = 256;
/** Formula cells counted per workbook, at most; past it, further cells are not counted. */
const MAX_CELLS = 100_000;
/** Distinct shapes counted per workbook, at most. */
const MAX_SHAPES = 5_000;
/** Cells read between two looks at the clock; a formula cell costs a few microseconds. */
const CELLS_PER_CHECK = 32;
/** The longest an idle slice works, in milliseconds. */
export const SLICE_MS = 2;
/** Excel's column count: a cell's key is `row × COLUMNS + col`. */
const COLUMNS = 16_384;

/** Operations that change no cell content. */
const CONTENT_KEPT: ReadonlySet<DocumentOp["op"]> = new Set([
  "setRangeStyle",
  "setColumn",
  "setRowMeta",
  "addMerge",
  "removeMerge",
  "moveSheet",
  "addTable",
  "updateTable",
  "removeTable",
]);

/** One shape and how many counted cells hold it; every such cell refers to this one object. */
interface Shape {
  readonly text: string;
  count: number;
}

/** How far the count of one visible sheet has got. */
interface SheetCount {
  readonly id: SheetId;
  readonly rows: number;
  readonly cols: number;
  /** The next cell to read, row by row; the cells before it are counted. */
  row: number;
  col: number;
  /**
   * The shape of each counted formula cell, by key. A change event names the
   * cell but not the formula it held before, so the count keeps it here.
   */
  readonly shapes: Map<number, Shape>;
}

/** How the count runs: in idle slices in a browser, or at once for a benchmark or a test. */
export type BuildMode = "idle" | "now";

/** Runs `work` when the page is idle. */
function whenIdle(work: () => void): void {
  if (typeof requestIdleCallback === "function") requestIdleCallback(work);
  else setTimeout(work, 0);
}

/** The sheet a cell operation writes to; null for operations without one. */
function sheetOf(op: DocumentOp): SheetId | null {
  if ("addr" in op) return op.addr.sheet;
  if ("range" in op) return op.range.sheet;
  if ("sheet" in op) return typeof op.sheet === "string" ? op.sheet : op.sheet.id;
  return null;
}

/**
 * The formulas of a workbook's visible sheets, counted by shape. Memory: at
 * most 100,000 counted cells and 5,000 shapes of up to 256 characters.
 */
export class WorkbookPatterns {
  /** The shapes counted, in the order they were first counted. */
  private readonly totals = new Map<string, Shape>();
  private readonly sheets = new Map<SheetId, SheetCount>();
  private cells = 0;
  private byCount: (readonly [string, number])[] | null = [];
  private scheduled = false;
  private disposed = false;
  private readonly stopListening: () => void;

  constructor(
    private readonly store: Store,
    private readonly mode: BuildMode,
  ) {
    this.stopListening = store.on("change", (event) => this.changed(event));
    this.followSheets();
  }

  /** How many formulas of the visible sheets have `shape`, counted so far. */
  count(shape: string): number {
    return this.totals.get(shape)?.count ?? 0;
  }

  /** The shapes counted so far, the most common first. */
  common(): readonly (readonly [string, number])[] {
    this.byCount ??= [...this.totals.values()]
      .map((shape) => [shape.text, shape.count] as const)
      .sort((left, right) => right[1] - left[1]);
    return this.byCount;
  }

  /** Stop counting and forget the workbook. */
  dispose(): void {
    this.disposed = true;
    this.stopListening();
    this.totals.clear();
    this.sheets.clear();
  }

  /** Count cells until `deadline` (from `performance.now()`); whether any are left. */
  step(deadline: number): boolean {
    for (const sheet of this.sheets.values()) {
      while (sheet.row < sheet.rows) {
        for (let read = 0; read < CELLS_PER_CHECK && sheet.row < sheet.rows; read++) {
          const formula = this.store.getFormula({
            sheet: sheet.id,
            row: sheet.row,
            col: sheet.col,
          });
          if (formula !== null) this.add(sheet, formula, sheet.row, sheet.col);
          if (++sheet.col >= sheet.cols) {
            sheet.col = 0;
            sheet.row++;
          }
        }
        if (performance.now() >= deadline) return true;
      }
    }
    return false;
  }

  /** Count every visible sheet that isn't yet, and forget those that are gone or hidden. */
  private followSheets(): void {
    const visible = new Map<SheetId, { rows: number; cols: number }>();
    for (const sheet of this.store.getWorkbook().sheets) {
      if ((sheet.visibility ?? "visible") === "visible") {
        visible.set(sheet.id, { rows: sheet.rowCount, cols: sheet.columns.length });
      }
    }
    for (const id of this.sheets.keys()) if (!visible.has(id)) this.forget(id);
    for (const [id, size] of visible) if (!this.sheets.has(id)) this.recount(id, size);
  }

  /** Count `id` again from its first cell. */
  private recount(id: SheetId, size: { rows: number; cols: number }): void {
    this.forget(id);
    this.sheets.set(id, { id, ...size, row: 0, col: 0, shapes: new Map() });
    this.wake();
  }

  private forget(id: SheetId): void {
    const sheet = this.sheets.get(id);
    if (sheet === undefined) return;
    for (const shape of sheet.shapes.values()) this.release(shape);
    this.cells -= sheet.shapes.size;
    this.sheets.delete(id);
  }

  /** One cell fewer holds `shape`; a shape no cell holds is forgotten. */
  private release(shape: Shape): void {
    shape.count--;
    if (shape.count === 0) this.totals.delete(shape.text);
    this.byCount = null;
  }

  /** Count `formula` of `row`, `col` on `sheet`, unless a limit is reached or it is broken. */
  private add(sheet: SheetCount, formula: string, row: number, col: number): void {
    if (formula.length > MAX_FORMULA || this.cells >= MAX_CELLS || formula.includes("#REF!"))
      return;
    const text = shapeOf(formula, row, col);
    let shape = this.totals.get(text);
    if (shape === undefined) {
      if (this.totals.size >= MAX_SHAPES) return;
      shape = { text, count: 0 };
      this.totals.set(text, shape);
    }
    shape.count++;
    sheet.shapes.set(row * COLUMNS + col, shape);
    this.cells++;
    this.byCount = null;
  }

  /** Stop counting the formula of `row`, `col` on `sheet`, if it is counted. */
  private remove(sheet: SheetCount, row: number, col: number): void {
    const key = row * COLUMNS + col;
    const shape = sheet.shapes.get(key);
    if (shape === undefined) return;
    sheet.shapes.delete(key);
    this.cells--;
    this.release(shape);
  }

  /** Keep the counts current with one commit. */
  private changed(event: ChangeEvent): void {
    if (this.disposed) return;
    const recount = new Set<SheetId>();
    let sheetsChanged = false;
    for (const op of event.transaction.patches) {
      if (op.op === "set" || CONTENT_KEPT.has(op.op)) continue;
      const sheet = sheetOf(op);
      // A renamed sheet changes the formulas that name it, on any sheet.
      if (op.op === "renameSheet" || sheet === null) {
        for (const id of this.sheets.keys()) recount.add(id);
      } else recount.add(sheet);
      sheetsChanged ||=
        op.op === "addSheet" || op.op === "removeSheet" || op.op === "setSheetVisibility";
    }
    if (sheetsChanged) this.followSheets();
    for (const id of recount) {
      const sheet = this.sheets.get(id);
      if (sheet !== undefined) this.recount(id, sheet);
    }
    // A cell the count hasn't read yet is read with its new formula when the count gets there.
    for (const { addr, newValue } of event.changes) {
      const sheet = this.sheets.get(addr.sheet);
      if (sheet === undefined) continue;
      this.remove(sheet, addr.row, addr.col);
      const read = addr.row < sheet.row || (addr.row === sheet.row && addr.col < sheet.col);
      if (read && newValue.kind === "formula") this.add(sheet, newValue.src, addr.row, addr.col);
    }
  }

  /** Make sure the count runs: now, or in the next idle slice. */
  private wake(): void {
    if (this.mode === "now") {
      while (this.step(Number.POSITIVE_INFINITY));
      return;
    }
    if (this.scheduled) return;
    this.scheduled = true;
    whenIdle(() => {
      this.scheduled = false;
      if (!this.disposed && this.step(performance.now() + SLICE_MS)) this.wake();
    });
  }
}
