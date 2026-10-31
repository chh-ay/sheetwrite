// What formula help reads from the engine: the tokens of a formula and its
// first syntax error. Both come from the engine's own lexer and parser
// (`formulaTokens` and `formulaSyntaxError`, packages/wasm/src/formula_tokens.rs),
// so formula help cannot disagree with the engine about the syntax. This file
// adds only what needs function metadata: the calls, their argument counts,
// and the names the active engine and the store do not know.

import { getEngine } from "./engine.js";
import type { FormulaArgumentMetadata, FormulaFunctionMetadata } from "./functions/types.js";

/** A problem in a formula, with the span of text it marks. */
export interface FormulaDiagnostic {
  readonly from: number;
  readonly to: number;
  readonly message: string;
  /**
   * The formula ends before it is complete (a missing `)` or value at the end).
   * Editors can hold these back while the caret is at the end of the text.
   */
  readonly incomplete: boolean;
}

/** The token kinds of `formulaTokens`, in the order of `TokenKind` in formula_tokens.rs. */
const ENGINE_KINDS = [
  "num",
  "str",
  "bool",
  "error",
  "ident",
  "quoted",
  "structured",
  "op",
  "colon",
  "bang",
  "hash",
  "comma",
  "semicolon",
  "lparen",
  "rparen",
  "lbrace",
  "rbrace",
  "bad",
] as const;

type RawKind = (typeof ENGINE_KINDS)[number];

/** One token of the engine's lexer, with its text. Offsets are UTF-16 indices. */
export interface RawToken {
  readonly kind: RawKind;
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

/** `kind`, `from`, `to` and the whitespace flag of each token in `formulaTokens`. */
const TOKEN_FIELDS = 4;

/** Names the engine reads as Excel's future-function prefixes, not as unknown names. */
const FUTURE_FUNCTION_PREFIX = "_XL";

/** The engine's tokens of `text`; a leading `=` is not a token. */
export function formulaTokens(text: string): RawToken[] {
  const packed = getEngine().formulaTokens(text);
  const tokens: RawToken[] = [];

  for (let at = 0; at + TOKEN_FIELDS <= packed.length; at += TOKEN_FIELDS) {
    const kind = ENGINE_KINDS[packed[at] ?? ENGINE_KINDS.length];
    const from = packed[at + 1] ?? 0;
    const to = packed[at + 2] ?? from;
    if (kind === undefined) throw new Error(`Sheetwrite: unknown formula token kind ${packed[at]}`);

    tokens.push({ kind, from, to, text: text.slice(from, to) });
  }

  return tokens;
}

/** The engine parser's first error in `text`, or null when it reads the whole formula. */
export function syntaxError(text: string): FormulaDiagnostic | null {
  const error = getEngine().formulaSyntaxError(text);
  if (error === undefined) return null;

  try {
    return {
      from: error.from,
      to: error.to,
      message: error.message,
      incomplete: error.incomplete,
    };
  } finally {
    error.free();
  }
}

/** A function call: its name token, and its arguments once its `)` is read. */
interface CallSpan {
  readonly name: RawToken;
  /** Commas at the call's own depth. */
  commas: number;
  /** Whether a token stands between `(` and the first comma or `)`. */
  empty: boolean;
  closed: boolean;
}

type Frame = { readonly call: CallSpan } | { readonly call: null };

/** Whether the token at `index` is a name that a `(` follows: a function call. */
export function isCallName(tokens: readonly RawToken[], index: number): boolean {
  return tokens[index]?.kind === "ident" && tokens[index + 1]?.kind === "lparen";
}

/**
 * The calls among `tokens` that end at or before `until`, and the calls still
 * open there, innermost last. A `(` after a name opens a call; any other `(`
 * and `{` open a group, whose commas separate union areas or array values.
 */
export function scanCalls(
  tokens: readonly RawToken[],
  until = Number.POSITIVE_INFINITY,
): { calls: CallSpan[]; open: CallSpan[] } {
  const calls: CallSpan[] = [];
  const frames: Frame[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined || token.to > until) break;

    const top = frames.at(-1);
    if (top?.call?.empty === true && token.kind !== "rparen") top.call.empty = false;

    const name = tokens[index - 1];
    if (token.kind === "lparen" && name !== undefined && isCallName(tokens, index - 1)) {
      const call: CallSpan = { name, commas: 0, empty: true, closed: false };
      calls.push(call);
      frames.push({ call });
    } else if (token.kind === "lparen" || token.kind === "lbrace") {
      frames.push({ call: null });
    } else if (token.kind === "rparen" || token.kind === "rbrace") {
      const closed = frames.pop()?.call;
      if (closed !== null && closed !== undefined) closed.closed = true;
    } else if (token.kind === "comma" && top?.call) {
      top.call.commas += 1;
    }
  }

  const open = frames.flatMap((frame) => (frame.call === null ? [] : [frame.call]));
  return { calls, open };
}

/** Minimum and maximum argument counts that a function's argument metadata allows. */
function arity(args: readonly FormulaArgumentMetadata[]): { min: number; max: number } {
  let min = 0;
  for (const argument of args) {
    if (argument.optional !== true) min += 1;
  }

  const repeats = args.some((argument) => argument.repeating === true);
  return { min, max: repeats ? Number.POSITIVE_INFINITY : args.length };
}

function argumentWord(count: number): string {
  return count === 1 ? "argument" : "arguments";
}

function mark(token: RawToken, message: string): FormulaDiagnostic {
  return { from: token.from, to: token.to, message, incomplete: false };
}

/**
 * Unknown functions and wrong argument counts. A called name that the formula
 * also uses bare is a LET or LAMBDA parameter, so it is not unknown. An
 * argument count is checked only after the call's `)`, so a call that is still
 * being typed is not short of arguments. Without `functions`, nothing is checked.
 */
export function checkCalls(
  tokens: readonly RawToken[],
  functions: ReadonlyMap<string, FormulaFunctionMetadata>,
): FormulaDiagnostic[] {
  if (functions.size === 0) return [];

  const bareNames = new Set(
    tokens
      .filter((token, index) => token.kind === "ident" && !isCallName(tokens, index))
      .map((token) => token.text.toUpperCase()),
  );
  const diagnostics: FormulaDiagnostic[] = [];

  for (const call of scanCalls(tokens).calls) {
    const key = call.name.text.toUpperCase();
    const fn = functions.get(key);
    if (fn === undefined) {
      if (!bareNames.has(key) && !key.startsWith(FUTURE_FUNCTION_PREFIX)) {
        diagnostics.push(mark(call.name, `${key} is not a known function. The cell shows #NAME?.`));
      }
      continue;
    }
    if (!call.closed) continue;

    const count = call.empty ? 0 : call.commas + 1;
    const { min, max } = arity(fn.arguments);
    if (count < min) {
      diagnostics.push(mark(call.name, `${key} needs at least ${min} ${argumentWord(min)}.`));
    } else if (count > max) {
      diagnostics.push(mark(call.name, `${key} takes at most ${max} ${argumentWord(max)}.`));
    }
  }

  return diagnostics;
}
