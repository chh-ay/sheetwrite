// The references of a formula and Excel's F4 on them. The cell editor needs
// F4 on every edit, so this is the part of formula analysis in the grid's
// first load; `analyzeFormula` and its completion load with formula help.

import { labelToCol } from "./a1.js";
import { formulaTokens, isCallName, type RawToken } from "./formula-syntax.js";

/** Excel's sheet size, which a whole column or row reference spans. */
const LAST_ROW = 1_048_575;
const LAST_COLUMN = 16_383;

const CELL = /^\$?([A-Za-z]{1,3})\$?(\d+)$/;
const COLUMN = /^\$?([A-Za-z]{1,3})$/;
const ROW = /^\$?(\d+)$/;

/** A 0-based cell position. */
export interface FormulaCellPosition {
  /** Zero-based row. */
  readonly row: number;
  /** Zero-based column. */
  readonly col: number;
}

/**
 * A cell, range, whole-column or whole-row reference. `sheet` is the sheet
 * name as written, without quotes, or null for the formula's own sheet. Equal
 * references share one `colorIndex`, so an editor gives each distinct
 * reference one colour in the text and on the grid.
 */
export interface FormulaReference {
  /** UTF-16 offset in the formula text where the reference starts. */
  readonly from: number;
  /** UTF-16 offset where the reference ends, not included. */
  readonly to: number;
  /** Sheet name as written, without quotes; `null` for the formula's own sheet. */
  readonly sheet: string | null;
  /** Top-left cell of the reference. */
  readonly start: FormulaCellPosition;
  /** Bottom-right cell of the reference; the same as `start` for one cell. */
  readonly end: FormulaCellPosition;
  /** Colour slot of the reference, counted from 0 in order of first use. */
  readonly colorIndex: number;
}

/** One end of a reference, or null when `token` is not one. */
type ReferenceEnd =
  | { readonly kind: "cell"; readonly row: number; readonly col: number }
  | { readonly kind: "column"; readonly col: number }
  | { readonly kind: "row"; readonly row: number };

function reference_end(token: RawToken | undefined): ReferenceEnd | null {
  if (token === undefined) return null;
  if (token.kind === "num") {
    const row = Number(token.text) - 1;
    return Number.isInteger(row) && row >= 0 && row <= LAST_ROW ? { kind: "row", row } : null;
  }
  if (token.kind !== "ident") return null;

  const cell = CELL.exec(token.text);
  if (cell !== null) {
    const col = labelToCol((cell[1] ?? "").toUpperCase());
    const row = Number(cell[2]) - 1;
    const valid = col <= LAST_COLUMN && row >= 0 && row <= LAST_ROW;
    return valid ? { kind: "cell", row, col } : null;
  }

  const column = COLUMN.exec(token.text);
  if (column !== null) {
    const col = labelToCol((column[1] ?? "").toUpperCase());
    return col <= LAST_COLUMN ? { kind: "column", col } : null;
  }

  const row = ROW.exec(token.text);
  const index = Number(row?.[1]) - 1;
  return row !== null && index >= 0 && index <= LAST_ROW ? { kind: "row", row: index } : null;
}

/** The rectangle two reference ends span; a lone column or row is not a reference. */
function span(
  first: ReferenceEnd,
  last: ReferenceEnd | null,
): { start: FormulaCellPosition; end: FormulaCellPosition } | null {
  if (last === null) {
    if (first.kind !== "cell") return null;
    const cell = { row: first.row, col: first.col };
    return { start: cell, end: cell };
  }
  if (first.kind === "cell" && last.kind === "cell") {
    return { start: { row: first.row, col: first.col }, end: { row: last.row, col: last.col } };
  }
  if (first.kind === "column" && last.kind === "column") {
    return { start: { row: 0, col: first.col }, end: { row: LAST_ROW, col: last.col } };
  }
  if (first.kind === "row" && last.kind === "row") {
    return { start: { row: first.row, col: 0 }, end: { row: last.row, col: LAST_COLUMN } };
  }

  return null;
}

function sheet_name(token: RawToken): string {
  return token.kind === "quoted" ? token.text.slice(1, -1).replaceAll("''", "'") : token.text;
}

/** The token indexes a reference covers, or null when no reference starts at `index`. */
function reference_at(
  tokens: readonly RawToken[],
  index: number,
): { reference: Omit<FormulaReference, "colorIndex">; next: number } | null {
  let at = index;
  let sheet: string | null = null;
  const qualifier = tokens[at];
  if (
    (qualifier?.kind === "ident" || qualifier?.kind === "quoted") &&
    tokens[at + 1]?.kind === "bang"
  ) {
    sheet = sheet_name(qualifier);
    at += 2;
  }

  const first = reference_end(tokens[at]);
  if (first === null || isCallName(tokens, at)) return null;

  const has_last = tokens[at + 1]?.kind === "colon" && !isCallName(tokens, at + 2);
  const last = has_last ? reference_end(tokens[at + 2]) : null;
  const rectangle = span(first, last);
  if (rectangle === null) return null;

  const end = last === null ? at : at + 2;
  const from = tokens[index]?.from ?? 0;
  const to = tokens[end]?.to ?? from;
  return { reference: { from, to, sheet, ...rectangle }, next: end + 1 };
}

/** Every reference, with one colour index per distinct sheet and rectangle. */
export function findReferences(tokens: readonly RawToken[]): FormulaReference[] {
  const references: FormulaReference[] = [];
  const colours = new Map<string, number>();

  let index = 0;
  while (index < tokens.length) {
    const found = reference_at(tokens, index);
    if (found === null) {
      index += 1;
      continue;
    }

    const { reference } = found;
    const key = `${reference.sheet?.toUpperCase() ?? ""}!${reference.start.row},${reference.start.col}:${reference.end.row},${reference.end.col}`;
    const color_index = colours.get(key) ?? colours.size;
    colours.set(key, color_index);
    references.push({ ...reference, colorIndex: color_index });
    index = found.next;
  }

  return references;
}

/** One cell of a written reference: optional `$`, column letters, optional `$`, row digits. */
const CELL_PART = /(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g;
/** F4's order of absolute column and row markers: A1, $A$1, A$1, $A1. */
const ANCHOR_STATES: ReadonlyArray<readonly [column: boolean, row: boolean]> = [
  [false, false],
  [true, true],
  [false, true],
  [true, false],
];

/**
 * Excel's F4 while editing: give the cell reference at or just before
 * `caret` the next `$` markers in the order A1, $A$1, A$1, $A1. Both corners
 * of a range take the first corner's next markers. Null when no cell
 * reference touches the caret.
 *
 * @param text - The formula text, starting with `=`.
 * @param caret - UTF-16 offset of the caret in `text`.
 * @returns The new text, and the caret after the changed reference.
 */
export function toggleReferenceAnchors(
  text: string,
  caret: number,
): { text: string; caret: number } | null {
  const reference = findReferences(formulaTokens(text)).find(
    (candidate) => candidate.from <= caret && caret <= candidate.to,
  );
  if (reference === undefined) return null;

  const written = text.slice(reference.from, reference.to);
  const qualifier = written.slice(0, written.lastIndexOf("!") + 1);
  const cells = written.slice(qualifier.length);
  const first = /^(\$?)[A-Za-z]{1,3}(\$?)\d/.exec(cells);
  if (first === null) return null;

  const current = ANCHOR_STATES.findIndex(
    ([column, row]) => column === (first[1] === "$") && row === (first[2] === "$"),
  );
  const [column, row] = ANCHOR_STATES[(current + 1) % ANCHOR_STATES.length] ?? [false, false];
  const toggled =
    qualifier +
    cells.replace(
      CELL_PART,
      (_match, _column, letters: string, _row, digits: string) =>
        `${column ? "$" : ""}${letters}${row ? "$" : ""}${digits}`,
    );
  return {
    text: text.slice(0, reference.from) + toggled + text.slice(reference.to),
    caret: reference.from + toggled.length,
  };
}
