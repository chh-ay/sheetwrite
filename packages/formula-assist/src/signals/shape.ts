// Signal 2 of #801, the shape of the data: under or beside a run of numbers,
// the cell most likely sums it, or takes the average, count, largest or
// smallest of it once that function is typed. The run is AutoSum's own, so
// the suggestion sums what the AutoSum button would.

import { cellA1, type FormulaAnalysis, type FormulaEdit, type Range } from "@sheetwrite/core";

import type { Candidate, Signal } from "../candidates.js";

/** Functions that take the run as their only argument. */
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

/** Measured on the development sets (see bench/README.md). */
const CONFIDENCE = {
  /** `=SUM(run)` from the `=`, before any function is typed. */
  sumFromStart: 0.85,
  /** The run, once an aggregate's `(` is typed. */
  aggregateArgument: 0.92,
} as const;

function rangeText(range: Range): string {
  const start = cellA1(range.start.row, range.start.col);
  const end = cellA1(range.end.row, range.end.col);
  return start === end ? start : `${start}:${end}`;
}

class Shape implements Signal {
  private readonly run: string | null;

  constructor(edit: FormulaEdit) {
    const { cell, reads } = edit;
    const range = reads.autoSumRange(cell.sheet, cell.row, cell.col);
    this.run = range === null ? null : rangeText(range);
  }

  candidates(text: string, analysis: FormulaAnalysis): Candidate[] {
    const run = this.run;
    if (run === null) return [];

    const candidates: Candidate[] = [
      { formula: `=SUM(${run})`, confidence: CONFIDENCE.sumFromStart, signal: "shape" },
    ];
    const call = analysis.call;
    const name = call?.name.toUpperCase() ?? "";
    if (call !== null && call.argumentIndex === 0 && AGGREGATES[name] === true && text.endsWith("(")) {
      candidates.push({
        formula: `${text}${run})`,
        confidence: CONFIDENCE.aggregateArgument,
        signal: "shape",
      });
    }
    return candidates;
  }
}

/** Open the shape-of-the-data signal of one edit; it finds the run once. */
export function openShape(edit: FormulaEdit): Signal {
  return new Shape(edit);
}
