import { getEngine } from "./engine.js";
import type { CellRef } from "./selection.js";

/** Column index (0-based) → A1 column label (0 → "A", 26 → "AA"). */
export function colToA1(col: number): string {
 let c = col + 1;
 let out = "";

 while (c > 0) {
  const rem = (c - 1) % 26;
  out = String.fromCharCode(65 + rem) + out;
  c = Math.floor((c - 1) / 26);
 }

 return out;
}

/** A1 column label → 0-based column index (inverse of {@link colToA1}). */
export function labelToCol(label: string): number {
 let c = 0;
 for (let i = 0; i < label.length; i++) c = c * 26 + (label.charCodeAt(i) - 64);
 return c - 1;
}

/** 0-based (row, col) → A1 cell reference (0, 0 → "A1"). */
export function cellA1(row: number, col: number): string {
 return `${colToA1(col)}${row + 1}`;
}

/** Two cell corners → A1 range ("A1:B3"), collapsing to a single ref when equal. */
export function rangeA1(a: CellRef, b: CellRef): string {
 if (a.row === b.row && a.col === b.col) return cellA1(a.row, a.col);

 const r0 = Math.min(a.row, b.row);
 const r1 = Math.max(a.row, b.row);
 const c0 = Math.min(a.col, b.col);
 const c1 = Math.max(a.col, b.col);

 return `${cellA1(r0, c0)}:${cellA1(r1, c1)}`;
}

/**
 * Shift relative A1 references in a formula by (dRow, dCol), as a copy or
 * fill from one cell to another does. Absolute parts ($A, A$1) stay fixed, and
 * a reference shifted off the sheet becomes `#REF!`. The engine owns the
 * reference rules, so this needs `initSheetwrite()` first.
 */
export function shiftA1Refs(src: string, dRow: number, dCol: number): string {
 if (dRow === 0 && dCol === 0) return src;

 return getEngine().translateFormula(src, dRow, dCol);
}

/** A row or column edit on one sheet that formula references follow. */
export type FormulaAxisEdit =
 /** `delta` rows or columns inserted (positive) or deleted (negative) at `at`. */
 | { readonly kind: "shift"; readonly at: number; readonly delta: number }
 /** `count` rows or columns moved from `from`; `to` is their first index after the move. */
 | { readonly kind: "move"; readonly from: number; readonly count: number; readonly to: number };

/**
 * Rewrite the unqualified references of a formula on the edited sheet through
 * one structural row or column edit. The engine applies the rules it uses for
 * its own formulas: absolute parts move too, a range loses its deleted rows or
 * columns, and only a reference with none left becomes `#REF!`.
 */
export function remapFormulaA1Refs(
 source: string,
 axis: "row" | "column",
 edit: FormulaAxisEdit,
): string {
 const engine = getEngine();
 const columns = axis === "column";

 return edit.kind === "shift"
  ? engine.shiftFormulaAxis(source, columns, edit.at, edit.delta)
  : engine.moveFormulaAxis(source, columns, edit.from, edit.count, edit.to);
}
