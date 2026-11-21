// Parallel sheets: the formula in the same cell of the other visible sheets,
// as on monthly sheets that repeat one layout. A formula several sheets
// agree on, beside the same row label, is likely the one this sheet needs.

import type { CellScalar, FormulaEdit } from "@sheetwrite/core";

import { bucket, type Proposal, type Signal } from "../candidates.js";
import { rowInputs } from "./inputs.js";

/** Sheets read at most, in tab order. */
const MOST_SHEETS = 64;
/** Buckets of how many other sheets give a formula. */
const AGREE_STEPS = [1, 2, 3];

/** The text of a label cell, letter case and spaces aside; null when it holds no text. */
function label(value: CellScalar): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim().toUpperCase() : null;
}

/** The formulas of the same cell on the other visible sheets, by how many sheets give each. */
function sheetProposals(edit: FormulaEdit): Proposal[] {
  const { cell, reads } = edit;
  const workbook = reads.workbook();
  // The label of the row: the first text in its row, left of the cell.
  const rowLabel = (sheet: string): string | null => {
    for (let col = 0; col < cell.col; col++) {
      const text = label(reads.value(sheet, cell.row, col));
      if (text !== null) return text;
    }
    return null;
  };
  const ownLabel = rowLabel(cell.sheet);
  const found = new Map<string, { formula: string; sheets: number; labelled: number }>();
  let withFormula = 0;
  for (const sheet of workbook.sheets.slice(0, MOST_SHEETS)) {
    // Hidden and very hidden sheets stay out (security review on #219, finding 5).
    if (sheet.id === cell.sheet || (sheet.visibility ?? "visible") !== "visible") continue;
    const formula = reads.formula(sheet.id, cell.row, cell.col);
    if (formula === null) continue;
    withFormula++;
    const key = formula.toUpperCase();
    const entry = found.get(key) ?? { formula, sheets: 0, labelled: 0 };
    entry.sheets++;
    if (ownLabel !== null && rowLabel(sheet.id) === ownLabel) entry.labelled++;
    found.set(key, entry);
  }
  return [...found.values()].map((entry) => ({
    formula: entry.formula,
    signal: "sheets" as const,
    reason: [
      `${bucket(entry.sheets, AGREE_STEPS)} sheets`,
      entry.sheets === withFormula ? "all agree" : "others differ",
      entry.labelled === entry.sheets && ownLabel !== null ? "same label" : "label differs",
      rowInputs(edit, entry.formula),
    ].join(", "),
  }));
}

/** Open the parallel-sheets signal of one edit; it reads the other sheets once. */
export function openSheets(edit: FormulaEdit): Signal {
  const proposals = sheetProposals(edit);
  return { proposals: () => proposals };
}
