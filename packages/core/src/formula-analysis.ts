// `analyzeFormula`, the one formula-help API: the grid's cell editor, the
// formula bar and host editors read tokens, references, the call at the
// cursor, completions and diagnostics from it. The tokens and the syntax error
// come from the active engine's lexer and parser (formula-syntax.ts); the
// function list it receives (from `listFunctions`) adds what is engine- and
// host-specific about names.

import { labelToCol } from "./a1.js";
import {
  checkCalls,
  formulaTokens,
  isCallName,
  scanCalls,
  syntaxError,
  type FormulaDiagnostic,
  type RawToken,
} from "./formula-syntax.js";
import type { FormulaArgumentMetadata, FormulaFunctionMetadata } from "./functions/types.js";

export type { FormulaDiagnostic };

/** What a token is; editors use it for syntax colours. */
export type FormulaTokenKind =
  | "number"
  | "string"
  | "boolean"
  | "error"
  | "function"
  | "reference"
  | "sheet"
  | "name"
  | "operator"
  | "separator"
  | "paren"
  | "invalid";

/** One token of a formula. `from` and `to` are UTF-16 offsets into the text. */
export interface FormulaToken {
  /** What the token is, for colouring: a number, a reference, an operator, and so on. */
  readonly kind: FormulaTokenKind;
  /** UTF-16 offset in the formula text where the token starts. */
  readonly from: number;
  /** UTF-16 offset where the token ends, not included. */
  readonly to: number;
}

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

/**
 * The innermost function call around the cursor. `argumentIndex` is 0-based;
 * `argument` is its metadata, and is undefined when the call has more
 * arguments than the function takes or the function is unknown.
 */
export interface FormulaCall {
  /** Function name as written. */
  readonly name: string;
  /** UTF-16 offset where the name starts. */
  readonly from: number;
  /** UTF-16 offset where the name ends, not included. */
  readonly to: number;
  /** Zero-based position of the argument the cursor is in. */
  readonly argumentIndex: number;
  /** Metadata of the function; undefined when the name is unknown. */
  readonly function: FormulaFunctionMetadata | undefined;
  /** Metadata of the argument the cursor is in. */
  readonly argument: FormulaArgumentMetadata | undefined;
}

/** Functions whose names start with the name at the cursor, and the span to replace. */
export interface FormulaCompletion {
  /** UTF-16 offset where the partial name starts; a chosen match replaces from here. */
  readonly from: number;
  /** UTF-16 offset where the partial name ends, not included. */
  readonly to: number;
  /** Functions whose names start with the partial name. */
  readonly matches: readonly FormulaFunctionMetadata[];
}

/** Everything formula help shows for one formula text and cursor offset. */
export interface FormulaAnalysis {
  /** Every token of the formula, in text order. */
  readonly tokens: readonly FormulaToken[];
  /** Every cell and range reference, in text order. */
  readonly references: readonly FormulaReference[];
  /** The innermost call around the cursor; `null` outside any call. */
  readonly call: FormulaCall | null;
  /** Function names that complete the name at the cursor; `null` when none applies. */
  readonly completion: FormulaCompletion | null;
  /** Syntax errors and unknown function names. */
  readonly diagnostics: readonly FormulaDiagnostic[];
}

/** Excel's sheet size, which a whole column or row reference spans. */
const LAST_ROW = 1_048_575;
const LAST_COLUMN = 16_383;

const CELL = /^\$?([A-Za-z]{1,3})\$?(\d+)$/;
const COLUMN = /^\$?([A-Za-z]{1,3})$/;
const ROW = /^\$?(\d+)$/;
const COMPLETABLE_NAME = /^[A-Za-z_]/;

const NOT_A_FORMULA: FormulaAnalysis = {
  tokens: [],
  references: [],
  call: null,
  completion: null,
  diagnostics: [],
};

const PUBLIC_KIND: Readonly<Partial<Record<RawToken["kind"], FormulaTokenKind>>> = {
  num: "number",
  str: "string",
  bool: "boolean",
  error: "error",
  quoted: "sheet",
  structured: "reference",
  op: "operator",
  colon: "operator",
  bang: "operator",
  hash: "operator",
  comma: "separator",
  semicolon: "separator",
  lparen: "paren",
  rparen: "paren",
  lbrace: "paren",
  rbrace: "paren",
  bad: "invalid",
};

/** One end of a reference, or null when `token` is not one. */
type ReferenceEnd =
  | { readonly kind: "cell"; readonly row: number; readonly col: number }
  | { readonly kind: "column"; readonly col: number }
  | { readonly kind: "row"; readonly row: number };

function referenceEnd(token: RawToken | undefined): ReferenceEnd | null {
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

function sheetName(token: RawToken): string {
  return token.kind === "quoted" ? token.text.slice(1, -1).replaceAll("''", "'") : token.text;
}

/** The token indexes a reference covers, or null when no reference starts at `index`. */
function referenceAt(
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
    sheet = sheetName(qualifier);
    at += 2;
  }

  const first = referenceEnd(tokens[at]);
  if (first === null || isCallName(tokens, at)) return null;

  const hasLast = tokens[at + 1]?.kind === "colon" && !isCallName(tokens, at + 2);
  const last = hasLast ? referenceEnd(tokens[at + 2]) : null;
  const rectangle = span(first, last);
  if (rectangle === null) return null;

  const end = last === null ? at : at + 2;
  const from = tokens[index]?.from ?? 0;
  const to = tokens[end]?.to ?? from;
  return { reference: { from, to, sheet, ...rectangle }, next: end + 1 };
}

/** Every reference, with one colour index per distinct sheet and rectangle. */
function findReferences(tokens: readonly RawToken[]): FormulaReference[] {
  const references: FormulaReference[] = [];
  const colours = new Map<string, number>();

  let index = 0;
  while (index < tokens.length) {
    const found = referenceAt(tokens, index);
    if (found === null) {
      index += 1;
      continue;
    }

    const { reference } = found;
    const key = `${reference.sheet?.toUpperCase() ?? ""}!${reference.start.row},${reference.start.col}:${reference.end.row},${reference.end.col}`;
    const colorIndex = colours.get(key) ?? colours.size;
    colours.set(key, colorIndex);
    references.push({ ...reference, colorIndex });
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

function publicKind(tokens: readonly RawToken[], index: number): FormulaTokenKind {
  const token = tokens[index];
  if (token === undefined) return "invalid";

  const mapped = PUBLIC_KIND[token.kind];
  if (mapped !== undefined) return mapped;

  if (isCallName(tokens, index)) return "function";
  if (tokens[index + 1]?.kind === "bang") return "sheet";
  return "name";
}

function publicTokens(
  tokens: readonly RawToken[],
  references: readonly FormulaReference[],
): FormulaToken[] {
  const inReference = (token: RawToken): boolean =>
    references.some((reference) => token.from >= reference.from && token.to <= reference.to);

  return tokens.map((token, index) => {
    const kind = publicKind(tokens, index);
    const isReferencePart = kind === "name" || kind === "number";
    return {
      kind: isReferencePart && inReference(token) ? "reference" : kind,
      from: token.from,
      to: token.to,
    };
  });
}

/** The metadata of argument `index`; repeating arguments take every later index. */
export function argumentOf(
  fn: FormulaFunctionMetadata | undefined,
  index: number,
): FormulaArgumentMetadata | undefined {
  if (fn === undefined) return undefined;

  const repeating = fn.arguments.findIndex((argument) => argument.repeating === true);
  if (repeating >= 0 && index >= repeating) return fn.arguments[repeating];
  return fn.arguments[index];
}

/** The innermost call whose parentheses hold `cursor`. */
function callAt(
  tokens: readonly RawToken[],
  cursor: number,
  functions: ReadonlyMap<string, FormulaFunctionMetadata>,
): FormulaCall | null {
  const call = scanCalls(tokens, cursor).open.at(-1);
  if (call === undefined) return null;

  const name = call.name.text.toUpperCase();
  const fn = functions.get(name);
  return {
    name,
    from: call.name.from,
    to: call.name.to,
    argumentIndex: call.commas,
    function: fn,
    argument: argumentOf(fn, call.commas),
  };
}

function byLengthThenName(left: FormulaFunctionMetadata, right: FormulaFunctionMetadata): number {
  const lengthOrder = left.name.length - right.name.length;
  if (lengthOrder !== 0) return lengthOrder;
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

/** Functions that start with the name the cursor ends or sits in, shortest first. */
function completionAt(
  tokens: readonly RawToken[],
  cursor: number,
  functions: readonly FormulaFunctionMetadata[],
): FormulaCompletion | null {
  const index = tokens.findIndex((token) => token.from < cursor && cursor <= token.to);
  const token = tokens[index];
  if (token?.kind !== "ident" || !COMPLETABLE_NAME.test(token.text)) return null;

  // After `!` or `:` the name is part of a reference, not a function.
  const previous = tokens[index - 1];
  if (previous?.kind === "bang" || previous?.kind === "colon") return null;

  const prefix = token.text.slice(0, cursor - token.from).toUpperCase();
  const matches = functions.filter((fn) => fn.name.startsWith(prefix)).sort(byLengthThenName);
  return matches.length === 0 ? null : { from: token.from, to: token.to, matches };
}

/**
 * Reads a formula as formula help needs it: its tokens, the references to
 * colour, the function call and argument at `cursor`, the functions that
 * complete the name at `cursor`, and syntax and call errors.
 *
 * `text` is the whole editor text, starting with `=`; any other text is not a
 * formula and gives an empty result. `cursor` and every `from` and `to` are
 * UTF-16 offsets into `text`. `functions` is the list from `listFunctions`,
 * which holds the active engine's built-in functions and the store's host
 * functions. With an empty list, completion is empty and no name is reported
 * as unknown.
 *
 * The tokens and the syntax error come from the engine's own lexer and
 * parser, so call it after `initSheetwrite`. The analysis never calculates:
 * it reads text and metadata only.
 *
 * @example
 * ```ts
 * import type { Store } from "@sheetwrite/core";
 * import { analyzeFormula, listFunctions } from "@sheetwrite/core/functions";
 *
 * async function currentArgument(store: Store, text: string, cursor: number) {
 *   const analysis = analyzeFormula(text, cursor, await listFunctions(store));
 *   return analysis.call?.argument?.name ?? null;
 * }
 * ```
 * @param text - The formula text, starting with `=`.
 * @param cursor - UTF-16 offset of the cursor in `text`.
 * @param functions - The functions formulas can call, from `listFunctions`.
 * @see /docs/features/formulas/formula-help/
 */
export function analyzeFormula(
  text: string,
  cursor: number,
  functions: readonly FormulaFunctionMetadata[],
): FormulaAnalysis {
  if (!text.startsWith("=")) return NOT_A_FORMULA;

  const byName = new Map(functions.map((fn) => [fn.name.toUpperCase(), fn]));
  const tokens = formulaTokens(text);
  const references = findReferences(tokens);
  const error = syntaxError(text);

  return {
    tokens: publicTokens(tokens, references),
    references,
    call: callAt(tokens, cursor, byName),
    completion: completionAt(tokens, cursor, functions),
    diagnostics: [...(error === null ? [] : [error]), ...checkCalls(tokens, byName)].sort(
      (left, right) => left.from - right.from,
    ),
  };
}
