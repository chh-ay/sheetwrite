// Workbook formulas: the workbook's own formulas, counted by shape, moved to
// the edited cell. The most common of them complete what the user types once
// one of them holds most of the formulas that still fit the typed text.

import type { FormulaEdit } from "@sheetwrite/core";

import { bucket, continues, type Proposal, type Signal } from "../candidates.js";
import { formulaOf, type WorkbookPatterns } from "../workbook-patterns.js";
import { type ColumnRelation, columnRelation } from "./column.js";

/** The most common shapes moved to the edited cell when the edit opens. */
const MOST_COMMON = 32;

/** A common shape moved to the edited cell, with what the signal knows of it. */
interface Placed {
  readonly formula: string;
  /** Formulas of the workbook with this shape. */
  readonly count: number;
  /**
   * Whether the column's nearest formula is this one. Where it is, the column
   * pattern already shows it; where it isn't, a common formula is less sure.
   */
  readonly column: ColumnRelation;
}

function place(edit: FormulaEdit, shape: string, count: number): Placed | null {
  const formula = formulaOf(shape, edit.cell.row, edit.cell.col);
  return formula.includes("#REF!")
    ? null
    : { formula, count, column: columnRelation(edit, formula) };
}

/** Buckets of how many formulas have a shape. */
const COUNT_STEPS = [1, 2, 5, 20];
/** Buckets of the share of the fitting formulas that one shape has. */
const SHARE_STEPS = [0, 0.5, 0.9];

class WorkbookFormulas implements Signal {
  private readonly placed: Placed[] = [];

  constructor(edit: FormulaEdit, patterns: WorkbookPatterns) {
    for (const [shape, count] of patterns.common().slice(0, MOST_COMMON)) {
      const placed = place(edit, shape, count);
      if (placed !== null) this.placed.push(placed);
    }
  }

  proposals(text: string): Proposal[] {
    const fitting = this.placed.filter((entry) => continues(entry.formula, text));
    const total = fitting.reduce((sum, entry) => sum + entry.count, 0);
    return fitting.map((entry) => ({
      formula: entry.formula,
      signal: "workbook" as const,
      reason: `share ${bucket(entry.count / total, SHARE_STEPS)} of ${bucket(total, COUNT_STEPS)}, ×${bucket(entry.count, COUNT_STEPS)}, ${entry.column}`,
    }));
  }
}

/** Open the workbook-formulas signal of one edit; without counted formulas it proposes none. */
export function openWorkbookFormulas(edit: FormulaEdit, patterns: WorkbookPatterns | null): Signal {
  return patterns === null ? { proposals: () => [] } : new WorkbookFormulas(edit, patterns);
}
