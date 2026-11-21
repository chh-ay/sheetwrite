// Column pattern: the nearest formula of the same column, above or below the
// edited cell, inside the same block of filled cells, moved to the edited
// cell. It reaches past the two cells the neighbour signal reads, and it also
// proposes a formula that only one side gives; how many cells in a row repeat
// it measures how sure it is.

import type { FormulaEdit } from "@sheetwrite/core";

import { bucket, type Proposal, type Signal } from "../candidates.js";
import { rowInputs } from "./inputs.js";

/** Rows searched in each direction for the nearest formula. */
const SEARCH = 100;
/** Buckets of how many cells in a row hold the formula; counting stops at the last. */
const RUN_STEPS = [1, 2, 3, 10];
const MOST_RUN = RUN_STEPS.at(-1) ?? 1;
/** Buckets of how far the nearest formula is: the two cells the neighbour signal reads, or further. */
const DISTANCE_STEPS = [1, 3];

/** The nearest formula one way along the column, moved to the edited cell, and how many cells in a row hold it. */
interface Found {
  readonly formula: string;
  readonly distance: number;
  readonly run: number;
}

function filled(edit: FormulaEdit, row: number): boolean {
  const { sheet, col } = edit.cell;
  if (edit.reads.formula(sheet, row, col) !== null) return true;
  const value = edit.reads.value(sheet, row, col);
  return value !== null && value !== "";
}

/** The nearest formula from the edited cell in `step` (−1 up, 1 down), before an empty cell. */
function nearest(edit: FormulaEdit, step: -1 | 1): Found | null {
  const { cell, reads } = edit;
  for (let distance = 1; distance <= SEARCH; distance++) {
    const row = cell.row + step * distance;
    if (row < 0) return null;
    const source = reads.formula(cell.sheet, row, cell.col);
    if (source === null) {
      if (!filled(edit, row)) return null;
      continue;
    }
    const formula = reads.translate(source, cell.row - row, 0);
    if (formula.includes("#REF!")) return null;
    let run = 1;
    while (run < MOST_RUN) {
      const next = row + step * run;
      const other = next < 0 ? null : reads.formula(cell.sheet, next, cell.col);
      if (
        other === null ||
        reads.translate(other, cell.row - next, 0).toUpperCase() !== formula.toUpperCase()
      )
        break;
      run++;
    }
    return { formula, distance, run };
  }
  return null;
}

function side(name: string, found: Found): string {
  return `${name} ${bucket(found.distance, DISTANCE_STEPS)} ×${bucket(found.run, RUN_STEPS)}`;
}

/** The column's nearest formulas of each edit, read once: the workbook signal compares with them too. */
const columns = new WeakMap<FormulaEdit, { above: Found | null; below: Found | null }>();

function around(edit: FormulaEdit): { above: Found | null; below: Found | null } {
  let found = columns.get(edit);
  if (found === undefined) {
    found = { above: nearest(edit, -1), below: nearest(edit, 1) };
    columns.set(edit, found);
  }
  return found;
}

/** How `formula` relates to the nearest formulas of the edited cell's column. */
export type ColumnRelation = "column agrees" | "column differs" | "column empty";

export function columnRelation(edit: FormulaEdit, formula: string): ColumnRelation {
  const { above, below } = around(edit);
  if (above === null && below === null) return "column empty";
  const key = formula.toUpperCase();
  return above?.formula.toUpperCase() === key || below?.formula.toUpperCase() === key
    ? "column agrees"
    : "column differs";
}

/** The column's formulas above and below, moved to the edited cell. */
function columnProposals(edit: FormulaEdit): Proposal[] {
  const { above, below } = around(edit);
  const proposal = (formula: string, reason: string): Proposal => ({
    formula,
    signal: "column",
    reason: `${reason}, ${rowInputs(edit, formula)}`,
  });
  if (above !== null && below !== null) {
    if (above.formula.toUpperCase() === below.formula.toUpperCase()) {
      return [proposal(above.formula, `both, ${side("above", above)}`)];
    }
    return [
      proposal(above.formula, `${side("above", above)}, below differs`),
      proposal(below.formula, `${side("below", below)}, above differs`),
    ];
  }
  if (above !== null) return [proposal(above.formula, side("above", above))];
  if (below !== null) return [proposal(below.formula, side("below", below))];
  return [];
}

/** Open the column-pattern signal of one edit; it reads the column once. */
export function openColumn(edit: FormulaEdit): Signal {
  const proposals = columnProposals(edit);
  return { proposals: () => proposals };
}
