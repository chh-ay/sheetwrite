// The formula's own syntax: a function name once the typed
// letters leave only one, a sheet name with its `!`, and the brackets that
// close calls which have all the arguments they can take.

import type { FormulaEdit } from "@sheetwrite/core";
import type {
  FormulaAnalysis,
  FormulaFunctionMetadata,
  FormulaToken,
} from "@sheetwrite/core/functions";

import type { Proposal, Signal } from "../candidates.js";

/** Fewer inserted characters save no key: Tab costs one too. */
const MIN_INSERT = 2;
/** One to three letters can be a column name, as in `AB` of `AB12`. */
const COLUMN_LETTERS = /^[A-Z]{1,3}$/i;
/** Constants that are also functions: as a constant they are far more common, so they get no `(`. */
const CONSTANTS: Readonly<Record<string, true>> = { TRUE: true, FALSE: true };
/** Sheet names a formula can name without quotes; others need the `'` the user types first. */
const PLAIN_NAME = /^[A-Z_][A-Z0-9_.]*$/i;
const LETTERS = 26;
/** Char code before `A`, so `A` counts as 1. */
const BEFORE_A = 64;

function column_index(letters: string): number {
  let index = 0;
  for (const letter of letters.toUpperCase())
    index = index * LETTERS + letter.charCodeAt(0) - BEFORE_A;
  return index - 1;
}

/** An open bracket at the caret: the function it calls, if any, and its arguments so far. */
interface OpenCall {
  readonly fn: FormulaFunctionMetadata | null;
  arguments: number;
  /** Whether the current argument has a token yet. */
  filled: boolean;
}

/** The brackets still open at the end of `tokens`, innermost last. */
function open_calls(
  tokens: readonly FormulaToken[],
  text: string,
  by_name: ReadonlyMap<string, FormulaFunctionMetadata>,
): OpenCall[] {
  const calls: OpenCall[] = [];
  for (const [index, token] of tokens.entries()) {
    const symbol = text.slice(token.from, token.to);
    const top = calls.at(-1);
    if (token.kind === "paren" && symbol === "(") {
      const previous = tokens[index - 1];
      const name =
        previous?.kind === "function" ? text.slice(previous.from, previous.to).toUpperCase() : "";
      calls.push({ fn: by_name.get(name) ?? null, arguments: 1, filled: false });
    } else if (token.kind === "paren" && symbol === ")") {
      calls.pop();
      const outer = calls.at(-1);
      if (outer !== undefined) outer.filled = true;
    } else if (token.kind === "separator" && symbol === "," && top !== undefined) {
      top.arguments++;
      top.filled = false;
    } else if (top !== undefined) {
      top.filled = true;
    }
  }
  return calls;
}

function max_arguments(fn: FormulaFunctionMetadata): number {
  return fn.arguments.some((argument) => argument.repeating === true)
    ? Number.POSITIVE_INFINITY
    : fn.arguments.length;
}

/** `)` for each innermost call that has all the arguments it can take. */
function closers(calls: readonly OpenCall[]): string {
  let closing = "";
  for (let index = calls.length - 1; index >= 0; index--) {
    const call = calls[index];
    if (call === undefined || call.fn === null || !call.filled) break;
    if (call.arguments < max_arguments(call.fn)) break;
    closing += ")";
  }
  return closing;
}

class Syntax implements Signal {
  private by_name: ReadonlyMap<string, FormulaFunctionMetadata> = new Map();
  private listed: readonly FormulaFunctionMetadata[] = [];

  constructor(private readonly edit: FormulaEdit) {}

  proposals(text: string, analysis: FormulaAnalysis): Proposal[] {
    const functions = this.edit.functions();
    if (functions !== this.listed) {
      this.listed = functions;
      this.by_name = new Map(functions.map((fn) => [fn.name.toUpperCase(), fn]));
    }

    const last = analysis.tokens.at(-1);
    if (last === undefined || last.to !== text.length) return [];

    const proposals: Proposal[] = [];
    const add = (formula: string, reason: string): void => {
      if (formula.length - text.length >= MIN_INSERT) {
        proposals.push({ formula, signal: "syntax", reason });
      }
    };
    // After `]` the name is a sheet of another workbook, as in `[Budget.xlsx]Annual!A1`.
    if (last.kind === "name" && text.charAt(last.from - 1) !== "]") {
      const name = this.name(text, analysis, last);
      if (name !== null) add(`${text.slice(0, last.from)}${name.text}`, name.reason);
    }

    const closing = closers(open_calls(analysis.tokens, text, this.by_name));
    const ends = last.kind === "paren" || (last.kind === "string" && text.endsWith('"'));
    if (closing.length > 0) add(text + closing, ends ? "closeAfterEnd" : "closeAfterValue");
    return proposals;
  }

  /** The function or sheet whose name the typed letters start, when only one does. */
  private name(
    text: string,
    analysis: FormulaAnalysis,
    last: FormulaToken,
  ): { text: string; reason: string } | null {
    const typed = text.slice(last.from).toUpperCase();
    const workbook = this.edit.reads.workbook();
    const sheet = workbook.sheets.find((entry) => entry.id === this.edit.cell.sheet);
    // Letters that name a column in use are as likely the start of a reference.
    if (COLUMN_LETTERS.test(typed) && column_index(typed) < (sheet?.columns.length ?? 0))
      return null;

    const names = [
      ...(workbook.namedRanges ?? []).map((named) => named.name),
      ...workbook.sheets.flatMap((entry) => (entry.tables ?? []).map((table) => table.name)),
    ];
    if (names.some((name) => name.toUpperCase().startsWith(typed))) return null;

    // Hidden and very hidden sheets stay out, as they do from the sheet tabs and every list.
    const sheets = workbook.sheets.filter(
      (entry) =>
        (entry.visibility ?? "visible") === "visible" &&
        PLAIN_NAME.test(entry.name) &&
        entry.name.toUpperCase().startsWith(typed),
    );
    const matches = analysis.completion?.matches ?? [];
    const [fn] = matches;
    const constant = fn !== undefined && CONSTANTS[fn.name.toUpperCase()] === true;
    if (matches.length === 1 && sheets.length === 0 && fn !== undefined && !constant) {
      return { text: `${fn.name}(`, reason: "functionName" };
    }
    const [only] = sheets;
    if (sheets.length === 1 && matches.length === 0 && only !== undefined) {
      return { text: `${only.name}!`, reason: "sheetName" };
    }
    return null;
  }
}

export function openSyntax(edit: FormulaEdit): Signal {
  return new Syntax(edit);
}
