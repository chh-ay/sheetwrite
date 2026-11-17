// Signal 5 of #801, the formula's own syntax: a function name once the typed
// letters leave only one, a sheet name with its `!`, and the brackets that
// close calls which have all the arguments they can take.

import type {
  FormulaAnalysis,
  FormulaEdit,
  FormulaFunctionMetadata,
  FormulaToken,
} from "@sheetwrite/core";

import type { Candidate, Signal } from "../candidates.js";

/** Measured on the development sets (see bench/README.md). */
const CONFIDENCE = {
  /** The only function whose name starts with the typed letters. */
  functionName: 0.95,
  /** The only sheet whose name starts with the typed letters. */
  sheetName: 0.92,
  /** Closing brackets after a token that can't grow: `)` or a closed string. */
  closeAfterEnd: 0.95,
  /** Closing brackets after a number or reference, which the user may still be typing. */
  closeAfterValue: 0.7,
} as const;

/** Fewer inserted characters save no key: Tab costs one too. */
const MIN_INSERT = 2;
/** One to three letters can be a column name, as in `AB` of `AB12`. */
const COLUMN_LETTERS = /^[A-Z]{1,3}$/i;
const CONSTANTS = ["TRUE", "FALSE"];

function columnIndex(letters: string): number {
  let index = 0;
  for (const letter of letters.toUpperCase()) index = index * 26 + letter.charCodeAt(0) - 64;
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
function openCalls(
  tokens: readonly FormulaToken[],
  text: string,
  byName: ReadonlyMap<string, FormulaFunctionMetadata>,
): OpenCall[] {
  const calls: OpenCall[] = [];
  for (const [index, token] of tokens.entries()) {
    const symbol = text.slice(token.from, token.to);
    const top = calls.at(-1);
    if (token.kind === "paren" && symbol === "(") {
      const previous = tokens[index - 1];
      const name =
        previous?.kind === "function" ? text.slice(previous.from, previous.to).toUpperCase() : "";
      calls.push({ fn: byName.get(name) ?? null, arguments: 1, filled: false });
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

function maxArguments(fn: FormulaFunctionMetadata): number {
  return fn.arguments.some((argument) => argument.repeating === true)
    ? Number.POSITIVE_INFINITY
    : fn.arguments.length;
}

/** `)` for each innermost call that has all the arguments it can take. */
function closers(calls: readonly OpenCall[]): string {
  let closing = "";
  for (let index = calls.length - 1; index >= 0; index--) {
    const call = calls[index];
    if (call?.fn === null || call === undefined || !call.filled) break;
    if (call.arguments < maxArguments(call.fn)) break;
    closing += ")";
  }
  return closing;
}

class Syntax implements Signal {
  private byName: ReadonlyMap<string, FormulaFunctionMetadata> = new Map();
  private listed: readonly FormulaFunctionMetadata[] = [];

  constructor(private readonly edit: FormulaEdit) {}

  candidates(text: string, analysis: FormulaAnalysis): Candidate[] {
    const functions = this.edit.functions();
    if (functions !== this.listed) {
      this.listed = functions;
      this.byName = new Map(functions.map((fn) => [fn.name.toUpperCase(), fn]));
    }

    const last = analysis.tokens.at(-1);
    if (last === undefined || last.to !== text.length) return [];

    const candidates: Candidate[] = [];
    if (last.kind === "name") this.names(text, analysis, last, candidates);
    this.closing(text, analysis, last, candidates);
    return candidates;
  }

  /** The function, constant or sheet whose name the typed letters start, when only one does. */
  private names(
    text: string,
    analysis: FormulaAnalysis,
    last: FormulaToken,
    candidates: Candidate[],
  ): void {
    const typed = text.slice(last.from).toUpperCase();
    const workbook = this.edit.reads.workbook();
    const sheet = workbook.sheets.find((entry) => entry.id === this.edit.cell.sheet);
    // Letters that name a column in use are as likely the start of a reference.
    if (COLUMN_LETTERS.test(typed) && columnIndex(typed) < (sheet?.columns.length ?? 0)) return;

    const names = [
      ...(workbook.namedRanges ?? []).map((named) => named.name.toUpperCase()),
      ...(workbook.tables ?? []).map((table) => table.name.toUpperCase()),
    ].filter((name) => name.startsWith(typed));
    const sheets = workbook.sheets.filter((entry) => entry.name.toUpperCase().startsWith(typed));
    const matches = analysis.completion?.matches ?? [];
    const constants = CONSTANTS.filter((constant) => constant.startsWith(typed));
    if (names.length > 0) return;

    const [fn] = matches;
    if (matches.length === 1 && sheets.length === 0 && fn !== undefined) {
      const constant = constants.find((name) => name === fn.name.toUpperCase());
      const rest = constant ?? `${fn.name}(`;
      this.add(candidates, `${text.slice(0, last.from)}${rest}`, text, "functionName");
      return;
    }

    const [only] = sheets;
    if (sheets.length === 1 && matches.length === 0 && only !== undefined) {
      this.add(candidates, `${text.slice(0, last.from)}${only.name}!`, text, "sheetName");
    }
  }

  private closing(
    text: string,
    analysis: FormulaAnalysis,
    last: FormulaToken,
    candidates: Candidate[],
  ): void {
    const closing = closers(openCalls(analysis.tokens, text, this.byName));
    if (closing.length === 0) return;

    const ends = last.kind === "paren" || (last.kind === "string" && text.endsWith('"'));
    this.add(candidates, text + closing, text, ends ? "closeAfterEnd" : "closeAfterValue");
  }

  private add(
    candidates: Candidate[],
    formula: string,
    text: string,
    reason: keyof typeof CONFIDENCE,
  ): void {
    if (formula.length - text.length < MIN_INSERT) return;
    candidates.push({ formula, confidence: CONFIDENCE[reason], signal: "syntax", reason });
  }
}

/** Open the syntax signal of one edit. */
export function openSyntax(edit: FormulaEdit): Signal {
  return new Syntax(edit);
}
