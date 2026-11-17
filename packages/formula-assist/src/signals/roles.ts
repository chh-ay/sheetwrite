// Signal 3 of #801, argument roles: what an argument of a lookup or
// conditional sum usually is, read from the sheet. The value looked up is the
// row's key (the first cell of the row's block) or the cell to the left;
// VLOOKUP's column number is the position, in the table, of the header the
// edited column carries.

import { cellA1, type FormulaEdit } from "@sheetwrite/core";
import type { FormulaAnalysis } from "@sheetwrite/core/functions";

import type { Proposal, Signal } from "../candidates.js";

/** The argument that holds the value looked up, or the criteria, by function. */
const KEY_ARGUMENT: Readonly<Record<string, number>> = {
  VLOOKUP: 0,
  HLOOKUP: 0,
  XLOOKUP: 0,
  MATCH: 0,
  XMATCH: 0,
  LOOKUP: 0,
  SUMIF: 1,
  COUNTIF: 1,
  AVERAGEIF: 1,
};

/** Text of a cell, as headers are compared: trimmed, letter case aside. */
function headerKey(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim().toUpperCase() : null;
}

class Roles implements Signal {
  /** A1 text of the row's key and of the cell to the left; null when the cell starts its row. */
  private readonly rowKey: string | null;
  private readonly leftCell: string | null;
  /** The header over the edited column: the text at the top of its block. */
  private readonly header: string | null;

  constructor(private readonly edit: FormulaEdit) {
    const { cell, reads } = edit;
    const left = cell.col - 1;
    const filledLeft = left >= 0 && reads.value(cell.sheet, cell.row, left) !== null;
    const first = filledLeft ? reads.edge(cell.sheet, cell.row, left, 0, -1) : null;
    this.rowKey = first === null ? null : cellA1(cell.row, first);
    this.leftCell = filledLeft ? cellA1(cell.row, left) : null;

    const region = reads.region(cell.sheet, cell.row, cell.col);
    const top = region?.start.row ?? cell.row;
    this.header = top < cell.row ? headerKey(reads.value(cell.sheet, top, cell.col)) : null;
  }

  proposals(text: string, analysis: FormulaAnalysis): Proposal[] {
    const call = analysis.call;
    if (call === null || !(text.endsWith("(") || text.endsWith(","))) return [];

    const name = call.name.toUpperCase();
    const proposals: Proposal[] = [];
    const add = (insert: string, reason: string): void => {
      proposals.push({ formula: `${text}${insert},`, signal: "roles", reason });
    };
    if (KEY_ARGUMENT[name] === call.argumentIndex) {
      if (this.rowKey !== null) add(this.rowKey, "rowKey");
      if (this.leftCell !== null && this.leftCell !== this.rowKey) add(this.leftCell, "leftCell");
    }
    if (name === "VLOOKUP" && call.argumentIndex === 2) {
      const column = this.columnFromHeader(analysis);
      if (column !== null) add(String(column), "columnFromHeader");
    }
    return proposals;
  }

  /** The 1-based column of the table (the call's last reference) whose first row holds this column's header. */
  private columnFromHeader(analysis: FormulaAnalysis): number | null {
    const header = this.header;
    const table = analysis.references.at(-1);
    if (header === null || table === undefined) return null;

    const { reads, cell } = this.edit;
    const sheetName = table.sheet?.toUpperCase();
    const sheet =
      sheetName === undefined
        ? cell.sheet
        : reads.workbook().sheets.find((entry) => entry.name.toUpperCase() === sheetName)?.id;
    if (sheet === undefined) return null;

    for (let col = table.start.col; col <= table.end.col; col++) {
      if (headerKey(reads.value(sheet, table.start.row, col)) === header) {
        return col - table.start.col + 1;
      }
    }
    return null;
  }
}

/** Open the argument-roles signal of one edit; it reads the row and column around the cell once. */
export function openRoles(edit: FormulaEdit): Signal {
  return new Roles(edit);
}
