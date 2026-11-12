// The result preview of formula help: what a formula text would give in a
// cell, read from the engine without changing the store (`previewFormula` in
// packages/wasm/src/eval/preview.rs).

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
 * 10,000 cells, gives `cost-limit` rather than a partial answer.
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
  if (engine === null) throw new Error("Sheetwrite: previewFormula needs a SheetwriteStore");

  return engine.previewFormula(cell, text);
}
