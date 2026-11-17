// Formula suggestions from an add-on: which store has a suggester, and the
// reads a suggestion session gets. Only lazy chunks import this module (the
// add-on registry, formula help and the testing entry), so a page without a
// suggester loads none of it.

import { shiftA1Refs } from "./a1.js";
import { storeFunctions } from "./functions/registry.js";
import type { FormulaFunctionMetadata } from "./functions/types.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellAddress } from "./types/coordinates.js";
import type { FormulaEdit, FormulaSheetReads, FormulaSuggester } from "./types/formula-suggestion.js";
import type { Store } from "./types/store.js";

/** The suggester of each store's grids; a store without one shows no suggestions. */
const suggesters = new WeakMap<Store, FormulaSuggester>();

/**
 * Give the formula bars of `store` their suggester; the returned function
 * removes it again, unless another suggester replaced it in between.
 */
export function setFormulaSuggester(store: Store, suggester: FormulaSuggester): () => void {
  suggesters.set(store, suggester);
  return () => {
    if (suggesters.get(store) === suggester) suggesters.delete(store);
  };
}

/** The suggester registered for `store`, or `null`. */
export function formulaSuggester(store: Store): FormulaSuggester | null {
  return suggesters.get(store) ?? null;
}

/** The workbook reads of a suggestion session, through the store and its engine. */
function sheetReads(store: Store): FormulaSheetReads {
  return {
    workbook: () => store.getWorkbook(),
    formula: (sheet, row, col) => store.getFormula({ sheet, row, col }),
    value: (sheet, row, col) => store.getCell({ sheet, row, col }).resolved,
    // A custom store without an engine has no Ctrl+Arrow scan: the edge is the cell itself.
    edge: (sheet, row, col, dRow, dCol) =>
      storeEngine(store)?.dataEdge(sheet, row, col, dRow, dCol) ?? (dRow === 0 ? col : row),
    translate: shiftA1Refs,
  };
}

/** One formula edit of `cell` in `store`; `functions` returns the function list loaded so far. */
export function formulaEdit(
  store: Store,
  cell: Readonly<CellAddress>,
  functions: () => readonly FormulaFunctionMetadata[],
): FormulaEdit {
  return { cell: { ...cell }, reads: sheetReads(store), functions };
}

/**
 * The formula edit the formula bar opens for `cell` of `store`, with the
 * store's function list already loaded: what a `FormulaSuggester` gets in
 * `open`. Runs a suggester without a grid, in tests and benchmarks.
 *
 * @returns The edit, to pass to `FormulaSuggester.open`.
 */
export async function openFormulaEdit(store: Store, cell: CellAddress): Promise<FormulaEdit> {
  const functions = await storeFunctions(store);
  return formulaEdit(store, cell, () => functions);
}
