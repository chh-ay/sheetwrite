// `analyzeFormula`, the one formula-help API: the grid's cell editor, the
// formula bar and host editors read tokens, references, the call at the
// cursor, completions and diagnostics from it. It is plain TypeScript with no
// engine call, so it works with both engines; the function list it receives
// (from `listFunctions`) is what makes it engine- and host-specific.

import { labelToCol } from "./a1.js";
import { checkFormula, type FormulaDiagnostic } from "./formula-check.js";
import { lexFormula, type RawToken } from "./formula-tokens.js";
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
  readonly kind: FormulaTokenKind;
  readonly from: number;
  readonly to: number;
}

/** A 0-based cell position. */
export interface FormulaCellPosition {
  readonly row: number;
  readonly col: number;
}

/**
 * A cell, range, whole-column or whole-row reference. `sheet` is the sheet
 * name as written, without quotes, or null for the formula's own sheet. Equal
 * references share one `colorIndex`, so an editor gives each distinct
 * reference one colour in the text and on the grid.
 */
export interface FormulaReference {
  readonly from: number;
  readonly to: number;
  readonly sheet: string | null;
  readonly start: FormulaCellPosition;
  readonly end: FormulaCellPosition;
  readonly colorIndex: number;
}

/**
 * The innermost function call around the cursor. `argumentIndex` is 0-based;
 * `argument` is its metadata, and is undefined when the call has more
 * arguments than the function takes or the function is unknown.
 */
export interface FormulaCall {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly argumentIndex: number;
  readonly function: FormulaFunctionMetadata | undefined;
  readonly argument: FormulaArgumentMetadata | undefined;
}

/** Functions whose names start with the name at the cursor, and the span to replace. */
export interface FormulaCompletion {
  readonly from: number;
  readonly to: number;
  readonly matches: readonly FormulaFunctionMetadata[];
}

/** Everything formula help shows for one formula text and cursor offset. */
export interface FormulaAnalysis {
  readonly tokens: readonly FormulaToken[];
  readonly references: readonly FormulaReference[];
  readonly call: FormulaCall | null;
  readonly completion: FormulaCompletion | null;
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
  error: "error",
  quoted: "sheet",
  structured: "reference",
  op: "operator",
  cmp: "operator",
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

function isCallName(tokens: readonly RawToken[], index: number): boolean {
  return tokens[index]?.kind === "ident" && tokens[index + 1]?.kind === "lparen";
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

function publicKind(tokens: readonly RawToken[], index: number): FormulaTokenKind {
  const token = tokens[index];
  if (token === undefined) return "invalid";

  const mapped = PUBLIC_KIND[token.kind];
  if (mapped !== undefined) return mapped;

  const upper = token.text.toUpperCase();
  if (isCallName(tokens, index)) return "function";
  if (tokens[index + 1]?.kind === "bang") return "sheet";
  if (upper === "TRUE" || upper === "FALSE") return "boolean";
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

type Frame = { kind: "call"; name: RawToken; argumentIndex: number } | { kind: "group" };

/** The innermost call whose parentheses hold `cursor`. */
function callAt(
  tokens: readonly RawToken[],
  cursor: number,
  functions: ReadonlyMap<string, FormulaFunctionMetadata>,
): FormulaCall | null {
  const frames: Frame[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined || token.to > cursor) break;

    const top = frames.at(-1);
    const previous = tokens[index - 1];
    if (token.kind === "lparen") {
      const isCall = previous !== undefined && isCallName(tokens, index - 1);
      frames.push(isCall ? { kind: "call", name: previous, argumentIndex: 0 } : { kind: "group" });
    } else if (token.kind === "lbrace") {
      frames.push({ kind: "group" });
    } else if (token.kind === "rparen" || token.kind === "rbrace") {
      frames.pop();
    } else if (token.kind === "comma" && top?.kind === "call") {
      top.argumentIndex += 1;
    }
  }

  // A reverse search, not findLast: the docs site compiles core with an ES2022 lib.
  const frame = [...frames].reverse().find((candidate) => candidate.kind === "call");
  if (frame === undefined || frame.kind !== "call") return null;

  const name = frame.name.text.toUpperCase();
  const fn = functions.get(name);
  return {
    name,
    from: frame.name.from,
    to: frame.name.to,
    argumentIndex: frame.argumentIndex,
    function: fn,
    argument: argumentOf(fn, frame.argumentIndex),
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
 * The analysis never calculates: it reads text and metadata only.
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
 * @see /docs/features/formulas/formula-help/
 */
export function analyzeFormula(
  text: string,
  cursor: number,
  functions: readonly FormulaFunctionMetadata[],
): FormulaAnalysis {
  if (!text.startsWith("=")) return NOT_A_FORMULA;

  const byName = new Map(functions.map((fn) => [fn.name.toUpperCase(), fn]));
  const { tokens, errors } = lexFormula(text, 1);
  const references = findReferences(tokens);

  return {
    tokens: publicTokens(tokens, references),
    references,
    call: callAt(tokens, cursor, byName),
    completion: completionAt(tokens, cursor, functions),
    diagnostics: [...errors, ...checkFormula(tokens, text.length, byName)].sort(
      (left, right) => left.from - right.from,
    ),
  };
}
