// Signal 2 of #801, the shape of the data: under or beside a run of numbers,
// the cell most likely sums it, or takes the average, count, largest or
// smallest of it once that function is typed. The runs are AutoSum's own and
// the filled blocks right above and right to the left of the cell.

import { cellA1, type FormulaEdit, type Range, type SheetId } from "@sheetwrite/core";
import type { FormulaAnalysis } from "@sheetwrite/core/functions";

import type { Proposal, Signal } from "../candidates.js";

/** Functions that take a run as their only argument. */
const AGGREGATES: Readonly<Record<string, true>> = {
  SUM: true,
  AVERAGE: true,
  COUNT: true,
  COUNTA: true,
  MAX: true,
  MIN: true,
  MEDIAN: true,
  PRODUCT: true,
};

function rangeText(range: Range): string {
  const start = cellA1(range.start.row, range.start.col);
  const end = cellA1(range.end.row, range.end.col);
  return start === end ? start : `${start}:${end}`;
}

/** A run next to the cell, as A1 text, and which run it is. */
interface Run {
  readonly text: string;
  readonly reason: "autoSum" | "columnBlock" | "rowBlock";
}

/**
 * The filled block that ends right before the cell going up (`dRow` −1) or
 * left (`dCol` −1), without a text cell at its far end (a header or label).
 */
function block(edit: FormulaEdit, dRow: number, dCol: number): Range | null {
  const { cell, reads } = edit;
  const sheet: SheetId = cell.sheet;
  const row = cell.row + dRow;
  const col = cell.col + dCol;
  if (row < 0 || col < 0 || typeof reads.value(sheet, row, col) !== "number") return null;

  const edge = reads.edge(sheet, row, col, dRow, dCol);
  const far = dRow === 0 ? { row, col: edge } : { row: edge, col };
  const startsWithLabel = typeof reads.value(sheet, far.row, far.col) === "string";
  const start = startsWithLabel ? { row: far.row - dRow, col: far.col - dCol } : far;
  return { sheet, start, end: { row, col } };
}

/** The distinct runs next to the edited cell. */
function runs(edit: FormulaEdit): Run[] {
  const { cell, reads } = edit;
  const found: Run[] = [];
  const add = (range: Range | null, reason: Run["reason"]): void => {
    if (range === null) return;
    const text = rangeText(range);
    if (!found.some((run) => run.text === text)) found.push({ text, reason });
  };
  add(reads.autoSumRange(cell.sheet, cell.row, cell.col), "autoSum");
  add(block(edit, -1, 0), "columnBlock");
  add(block(edit, 0, -1), "rowBlock");
  return found;
}

class Shape implements Signal {
  private readonly runs: readonly Run[];

  constructor(edit: FormulaEdit) {
    this.runs = runs(edit);
  }

  proposals(text: string, analysis: FormulaAnalysis): Proposal[] {
    const proposals: Proposal[] = this.runs.map((run) => ({
      formula: `=SUM(${run.text})`,
      signal: "shape",
      reason: `sumFromStart, ${run.reason}`,
    }));
    const call = analysis.call;
    const name = call?.name.toUpperCase() ?? "";
    if (call?.argumentIndex === 0 && AGGREGATES[name] === true && text.endsWith("(")) {
      for (const run of this.runs) {
        proposals.push({ formula: `${text}${run.text})`, signal: "shape", reason: run.reason });
      }
    }
    return proposals;
  }
}

/** Open the shape-of-the-data signal of one edit; it finds the runs once. */
export function openShape(edit: FormulaEdit): Signal {
  return new Shape(edit);
}
