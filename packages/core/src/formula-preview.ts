// The result preview of formula help: what a formula text would give in a
// cell, read from the engine without changing the store (`previewFormula` in
// packages/wasm/src/eval/preview.rs).

import { SheetwriteError } from "./errors.js";
import { storeEngine } from "./store/engine-registry.js";
import type { FormulaPreview } from "./store/formula-preview-result.js";
import type { CellAddress } from "./types/coordinates.js";
import type { Store } from "./types/store.js";

export type {
  FormulaPreview,
  FormulaPreviewUnavailable,
  FormulaPreviewValue,
} from "./store/formula-preview-result.js";

/**
 * The result `text` (a formula with its leading `=`) would have in `cell`,
 * without changing `store`. Referenced formulas give their current results;
 * nothing recalculates, and no history entry or event follows. Read-only
 * volatile functions (TODAY, NOW, OFFSET, INDIRECT, CELL, INFO) are
 * previewed; RAND, RANDBETWEEN and host functions are not called, and give
 * `unsafe-function`. A formula that reads more than 1,000,000 cells in typed
 * range scans or 50,000 cells one by one, or builds an array of more than
 * 10,000 cells, or builds and reads more than about 1 MB of text in total,
 * gives `cost-limit` rather than a partial answer.
 *
 * Throws a `SheetwriteError` with code `invalid-argument` when `store` is not
 * a `SheetwriteStore` or `cell.row` or `cell.col` is not a whole number from 0
 * to 4,294,967,295, and with code `not-found` when the workbook has no
 * `cell.sheet`.
 *
 * @example
 * ```ts
 * import type { Store } from "@sheetwrite/core";
 * import { previewFormula } from "@sheetwrite/core/functions";
 *
 * function previewText(store: Store, text: string): string {
 *   const preview = previewFormula(store, { sheet: "sheet-1", row: 0, col: 3 }, text);
 *   return preview.status === "value" ? String(preview.value) : "";
 * }
 * ```
 * @see /docs/features/formulas/formula-help/
 */
export function previewFormula(store: Store, cell: CellAddress, text: string): FormulaPreview {
  const engine = storeEngine(store);
  if (engine === null) throw invalidPreview("previewFormula needs a SheetwriteStore");
  if (!isCellIndex(cell.row) || !isCellIndex(cell.col)) {
    throw invalidPreview("previewFormula needs a whole-number row and column from 0");
  }

  return engine.previewFormula(cell, text);
}

function isCellIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff_ff_ff_ff;
}

function invalidPreview(message: string): SheetwriteError {
  return new SheetwriteError("invalid-argument", "store", `Sheetwrite: ${message}`);
}
