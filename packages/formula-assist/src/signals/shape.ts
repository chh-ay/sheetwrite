// The shape of the data: once a range's first cell and `:` are typed, its
// end is where the block of filled cells from that cell ends, the cell
// Ctrl+Shift+Arrow would reach. A range that runs along the edited cell's
// row or column stops right before the cell.

import { cellA1, type FormulaEdit, type SheetId } from "@sheetwrite/core";
import type { FormulaAnalysis, FormulaReference } from "@sheetwrite/core/functions";

import type { Proposal, Signal } from "../candidates.js";

/** `$` before the column, the row, both or neither, as the range's first cell has them. */
function anchored(start: string, row: number, col: number): string {
  const plain = cellA1(row, col);
  const letters = plain.replace(/[0-9]+$/, "");
  const digits = plain.slice(letters.length);
  const absoluteCol = start.startsWith("$");
  const absoluteRow = /\$[0-9]+$/.test(start);
  return `${absoluteCol ? "$" : ""}${letters}${absoluteRow ? "$" : ""}${digits}`;
}

class Shape implements Signal {
  constructor(private readonly edit: FormulaEdit) {}

  proposals(text: string, analysis: FormulaAnalysis): Proposal[] {
    if (!text.endsWith(":")) return [];
    const start = analysis.references.at(-1);
    if (start === undefined || start.to !== text.length - 1) return [];
    if (start.start.row !== start.end.row || start.start.col !== start.end.col) return [];

    const sheet = this.sheetOf(start);
    if (sheet === null) return [];
    return this.ends(sheet, start).map(({ row, col, reason }) => {
      const startText = text.slice(start.from, start.to).replace(/^.*!/, "");
      return { formula: `${text}${anchored(startText, row, col)}`, signal: "shape", reason };
    });
  }

  private sheetOf(reference: FormulaReference): SheetId | null {
    const { cell, reads } = this.edit;
    const name = reference.sheet?.toUpperCase();
    if (name === undefined) return cell.sheet;
    return reads.workbook().sheets.find((entry) => entry.name.toUpperCase() === name)?.id ?? null;
  }

  /** Where the block from the range's first cell ends, by the reason it ends there. */
  private ends(
    sheet: SheetId,
    reference: FormulaReference,
  ): { row: number; col: number; reason: string }[] {
    const { cell, reads } = this.edit;
    const { row, col } = reference.start;
    const own = sheet === cell.sheet;
    if (own && row === cell.row && col < cell.col) {
      const end = Math.min(reads.edge(sheet, row, col, 0, 1), cell.col - 1);
      return end > col ? [{ row, col: end, reason: "rangeAlongRow" }] : [];
    }
    if (own && col === cell.col && row < cell.row) {
      const end = Math.min(reads.edge(sheet, row, col, 1, 0), cell.row - 1);
      return end > row ? [{ row: end, col, reason: "rangeAlongColumn" }] : [];
    }

    const ends: { row: number; col: number; reason: string }[] = [];
    if (reads.value(sheet, row + 1, col) !== null) {
      ends.push({ row: reads.edge(sheet, row, col, 1, 0), col, reason: "rangeDown" });
    }
    if (reads.value(sheet, row, col + 1) !== null) {
      ends.push({ row, col: reads.edge(sheet, row, col, 0, 1), reason: "rangeRight" });
    }
    return ends;
  }
}

/** Open the shape-of-the-data signal of one edit. */
export function openShape(edit: FormulaEdit): Signal {
  return new Shape(edit);
}
