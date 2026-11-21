// The same-row inputs of a proposed formula. A formula copied down a column
// reads cells of its own row; when those cells are empty, the row is likely
// a total or a gap rather than one more row of data, and the copy is likely wrong.

import type { FormulaEdit } from "@sheetwrite/core";
import { analyzeFormula } from "@sheetwrite/core/functions";

/** What the single cells a formula reads in the edited row hold. */
export type RowInputs = "inputs filled" | "inputs empty" | "no row inputs";

/** Whether the cells `formula` reads in the edited cell's own row hold anything. */
export function rowInputs(edit: FormulaEdit, formula: string): RowInputs {
  const { cell, reads } = edit;
  let found = false;
  for (const reference of analyzeFormula(formula, 0, []).references) {
    const { start, end } = reference;
    if (reference.sheet !== null || start.row !== cell.row || end.row !== cell.row) continue;
    if (start.col !== end.col || start.col === cell.col) continue;
    found = true;
    const value = reads.value(cell.sheet, cell.row, start.col);
    if (
      reads.formula(cell.sheet, cell.row, start.col) === null &&
      (value === null || value === "")
    ) {
      return "inputs empty";
    }
  }
  return found ? "inputs filled" : "no row inputs";
}
