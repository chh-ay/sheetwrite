// `analyzeFormula`, the one formula-help API: the grid's cell editor, the
// formula bar and host editors read tokens, references, the call at the
// cursor, completions and diagnostics from it.

import { findReferences, type FormulaReference } from "./formula-references.js";
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

/**
 * What a completion item is: a function, a defined name, a table, a table
 * column or section after `[`, or a value that the argument at the cursor
 * takes, such as `FALSE` for `VLOOKUP`'s last argument.
 */
export type FormulaCompletionKind = "function" | "name" | "table" | "column" | "choice";

/** One item of the completion list. */
export interface FormulaCompletionItem {
  /** Whether the item is a function, a name, a table, a column or an argument value. */
  readonly kind: FormulaCompletionKind;
  /** The text the list shows: `SUM`, `SalesUnits`, `Table1`, `Amount`, `FALSE`. */
  readonly name: string;
  /**
   * The text a chosen item writes over `from` to `to`: `SUM(` for a function,
   * the name or value otherwise. A function followed by `(` already writes
   * only its name.
   */
  readonly insert: string;
  /** What the item is or means, such as `Exact match` for `FALSE` in `VLOOKUP`. */
  readonly description: string;
  /** The function's metadata, for a function. */
  readonly function?: FormulaFunctionMetadata;
}

/** The items that complete the text at the cursor, and the span a chosen item replaces. */
export interface FormulaCompletion {
  /** UTF-16 offset where the partial text starts; a chosen item replaces from here. */
  readonly from: number;
  /** UTF-16 offset where the partial text ends, not included. */
  readonly to: number;
  /** The items that start with the partial text, in list order. */
  readonly matches: readonly FormulaCompletionItem[];
}

/** A table, as completion lists it. */
export interface FormulaTableNames {
  /** The table's name, such as `Table1`. */
  readonly name: string;
  /** The names of its columns, in order. */
  readonly columns: readonly string[];
}

/** The names besides functions that a formula can use, as completion lists them. */
export interface FormulaNames {
  /** Defined names that the formula's sheet sees. */
  readonly names: readonly string[];
  /** The workbook's tables. */
  readonly tables: readonly FormulaTableNames[];
  /**
   * The name of the table that holds the formula's cell, whose columns a `[`
   * without a table name lists, as in `=[Sales]`.
   */
  readonly cellTable?: string;
}

/** Everything formula help shows for one formula text and cursor offset. */
export interface FormulaAnalysis {
  /** Every token of the formula, in text order. */
  readonly tokens: readonly FormulaToken[];
  /** Every cell and range reference, in text order. */
  readonly references: readonly FormulaReference[];
  /** The innermost call around the cursor; `null` outside any call. */
  readonly call: FormulaCall | null;
  /** The items that complete the text at the cursor; `null` when none applies. */
  readonly completion: FormulaCompletion | null;
  /** Syntax errors and unknown function names. */
  readonly diagnostics: readonly FormulaDiagnostic[];
}

const COMPLETABLE_NAME = /^[A-Za-z_]/;
/** Text an argument choice can complete: a number, a name, or a quoted word. */
const CHOICE_PREFIX = /^-?"?[\w.]*$/;

const NO_NAMES: FormulaNames = { names: [], tables: [] };

/** The sections that the engine reads in `Table1[[#Headers],[Column]]`. */
const TABLE_SECTIONS: readonly (readonly [name: string, description: string])[] = [
  ["#Headers", "The header row of the column."],
  ["#Totals", "The totals row of the column."],
];

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

function public_kind(tokens: readonly RawToken[], index: number): FormulaTokenKind {
  const token = tokens[index];
  if (token === undefined) return "invalid";

  const mapped = PUBLIC_KIND[token.kind];
  if (mapped !== undefined) return mapped;

  if (isCallName(tokens, index)) return "function";
  if (tokens[index + 1]?.kind === "bang") return "sheet";
  return "name";
}

function public_tokens(
  tokens: readonly RawToken[],
  references: readonly FormulaReference[],
): FormulaToken[] {
  const in_reference = (token: RawToken): boolean =>
    references.some((reference) => token.from >= reference.from && token.to <= reference.to);

  return tokens.map((token, index) => {
    const kind = public_kind(tokens, index);
    const is_reference_part = kind === "name" || kind === "number";
    return {
      kind: is_reference_part && in_reference(token) ? "reference" : kind,
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
function call_at(
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

function by_length_then_name(left: FormulaCompletionItem, right: FormulaCompletionItem): number {
  const length_order = left.name.length - right.name.length;
  if (length_order !== 0) return length_order;
  const left_key = left.name.toUpperCase();
  const right_key = right.name.toUpperCase();
  return left_key < right_key ? -1 : left_key > right_key ? 1 : 0;
}

/** Whether `name` starts with `prefix`, ignoring letter case. */
function starts_with(name: string, prefix: string): boolean {
  return name.slice(0, prefix.length).toUpperCase() === prefix.toUpperCase();
}

/**
 * Functions, defined names and tables that start with the name the cursor
 * ends or sits in, shortest first.
 */
function name_completion(
  tokens: readonly RawToken[],
  cursor: number,
  functions: readonly FormulaFunctionMetadata[],
  names: FormulaNames,
): FormulaCompletion | null {
  const index = tokens.findIndex((token) => token.from < cursor && cursor <= token.to);
  const token = tokens[index];
  if (token?.kind !== "ident" || !COMPLETABLE_NAME.test(token.text)) return null;

  // After `!` or `:` the name is part of a reference.
  const previous = tokens[index - 1];
  if (previous?.kind === "bang" || previous?.kind === "colon") return null;

  const prefix = token.text.slice(0, cursor - token.from);
  const matches: FormulaCompletionItem[] = [];
  for (const fn of functions) {
    if (!starts_with(fn.name, prefix)) continue;
    matches.push({
      kind: "function",
      name: fn.name,
      insert: `${fn.name}(`,
      description: fn.description,
      function: fn,
    });
  }
  for (const name of names.names) {
    if (starts_with(name, prefix)) {
      matches.push({ kind: "name", name, insert: name, description: "Defined name" });
    }
  }
  for (const table of names.tables) {
    if (starts_with(table.name, prefix)) {
      matches.push({ kind: "table", name: table.name, insert: table.name, description: "Table" });
    }
  }
  matches.sort(by_length_then_name);
  return matches.length === 0 ? null : { from: token.from, to: token.to, matches };
}

/**
 * Inside the brackets of a table reference: the table's columns, or after
 * `[[` the sections `#Headers` and `#Totals`, that start with the text
 * between the innermost open `[` and the cursor. `Table1[` names the table;
 * a `[` with no name before it names the table that holds the formula's cell.
 */
function table_completion(
  tokens: readonly RawToken[],
  text: string,
  cursor: number,
  names: FormulaNames,
): FormulaCompletion | null {
  // An unclosed `[` reads to the end of the text as one bad token.
  const index = tokens.findIndex(
    (token) => token.from < cursor && cursor <= token.to && text.charAt(token.from) === "[",
  );
  const token = tokens[index];
  if (token === undefined) return null;

  const before = tokens[index - 1];
  const table_name =
    before?.kind === "ident" && before.to === token.from ? before.text : names.cellTable;
  const key = table_name?.toUpperCase();
  const table = names.tables.find((candidate) => candidate.name.toUpperCase() === key);
  if (table === undefined) return null;

  const open: number[] = [];
  for (let at = token.from; at < cursor; at++) {
    const char = text.charAt(at);
    if (char === "[") open.push(at);
    else if (char === "]") open.pop();
  }
  const start = open.at(-1);
  if (start === undefined) return null;

  const from = start + 1;
  const prefix = text.slice(from, cursor);
  const to = cursor + (/^[^[\],]*/.exec(text.slice(cursor, token.to))?.[0].length ?? 0);
  const section = text.charAt(start - 1) === "[" && start - 1 === token.from;
  const matches: FormulaCompletionItem[] = section
    ? TABLE_SECTIONS.filter(([name]) => starts_with(name, prefix)).map(([name, description]) => ({
        kind: "column" as const,
        name,
        insert: name,
        description,
      }))
    : table.columns
        .filter((column) => starts_with(column, prefix))
        .map((column) => ({
          kind: "column" as const,
          name: column,
          insert: column,
          description: `Column of ${table.name}`,
        }));
  return matches.length === 0 ? null : { from, to, matches };
}

/**
 * The values the argument at the cursor takes, as Excel lists them for
 * `VLOOKUP`'s `range_lookup` or `MATCH`'s `match_type`: those that start
 * with the argument's text before the cursor. None once the text is a whole
 * value, so Enter commits it.
 */
function choice_completion(
  tokens: readonly RawToken[],
  text: string,
  cursor: number,
  call: FormulaCall | null,
): FormulaCompletion | null {
  const choices = call?.argument?.choices;
  if (call === null || choices === undefined) return null;

  // The argument starts after the call's `(` or its last comma before the cursor.
  let depth = 0;
  let start = call.to;
  for (let index = tokens.findIndex((token) => token.from === call.from) + 1; ; index++) {
    const token = tokens[index];
    if (token === undefined || token.to > cursor) break;
    if (token.kind === "lparen" || token.kind === "lbrace") depth += 1;
    else if (token.kind === "rparen" || token.kind === "rbrace") depth -= 1;
    if ((token.kind === "lparen" && depth === 1) || (token.kind === "comma" && depth === 1)) {
      start = token.to;
    }
  }

  const typed = text.slice(start, cursor);
  const prefix = typed.trimStart();
  if (!CHOICE_PREFIX.test(prefix)) return null;
  if (choices.some((choice) => choice.value.toUpperCase() === prefix.toUpperCase())) return null;

  const from = cursor - prefix.length;
  const to = cursor + (/^[\w."]*/.exec(text.slice(cursor))?.[0].length ?? 0);
  const matches = choices
    .filter((choice) => starts_with(choice.value, prefix))
    .map(({ value, description }) => ({
      kind: "choice" as const,
      name: value,
      insert: value,
      description,
    }));
  return matches.length === 0 ? null : { from, to, matches };
}

/**
 * Reads a formula as formula help needs it: its tokens, the references to
 * colour, the function call and argument at `cursor`, the items that
 * complete the text at `cursor`, and syntax and call errors.
 *
 * `text` is the whole editor text, starting with `=`; any other text is not a
 * formula and gives an empty result. `cursor` and every `from` and `to` are
 * UTF-16 offsets into `text`. `functions` is the list from `listFunctions`,
 * which holds the active engine's built-in functions and the store's host
 * functions. With an empty list, completion is empty and no name is reported
 * as unknown.
 *
 * Completion lists, as Excel's Formula AutoComplete does: the functions,
 * defined names and tables that start with the name at `cursor`; inside
 * `Table1[`, the table's columns; and where an argument takes one of a few
 * values, such as `VLOOKUP`'s `range_lookup`, those values. `names` holds the
 * defined names and tables to list.
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
 * @param names - The defined names and tables completion lists; none by default.
 * @see /docs/features/formulas/formula-help/
 */
export function analyzeFormula(
  text: string,
  cursor: number,
  functions: readonly FormulaFunctionMetadata[],
  names: FormulaNames = NO_NAMES,
): FormulaAnalysis {
  if (!text.startsWith("=")) return NOT_A_FORMULA;

  const by_name = new Map(functions.map((fn) => [fn.name.toUpperCase(), fn]));
  const tokens = formulaTokens(text);
  const references = findReferences(tokens);
  const error = syntaxError(text);
  const call = call_at(tokens, cursor, by_name);

  return {
    tokens: public_tokens(tokens, references),
    references,
    call,
    completion:
      table_completion(tokens, text, cursor, names) ??
      choice_completion(tokens, text, cursor, call) ??
      name_completion(tokens, cursor, functions, names),
    diagnostics: [...(error === null ? [] : [error]), ...checkCalls(tokens, by_name)].sort(
      (left, right) => left.from - right.from,
    ),
  };
}
