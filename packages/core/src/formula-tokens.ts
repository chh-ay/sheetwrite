// The formula lexer of formula help. It reads the same tokens as the engine's
// parser (`tokenize` in packages/wasm/src/calc.rs), but it never stops: an
// error becomes a diagnostic and lexing continues, because the text is often
// incomplete while the user types. Offsets are UTF-16 indices into the text.

/** One lexical token; `space` tells whether whitespace comes before it. */
export interface RawToken {
  readonly kind: RawKind;
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly space: boolean;
}

export type RawKind =
  | "num"
  | "str"
  | "ident"
  | "quoted"
  | "structured"
  | "error"
  | "op"
  | "cmp"
  | "lparen"
  | "rparen"
  | "comma"
  | "semicolon"
  | "lbrace"
  | "rbrace"
  | "colon"
  | "bang"
  | "hash"
  | "bad";

/**
 * A lexer error: the span of the bad text and its message. `incomplete` marks
 * a quote or bracket left open at the end, which typing usually closes.
 */
export interface LexError {
  readonly from: number;
  readonly to: number;
  readonly message: string;
  readonly incomplete: boolean;
}

/** Error constants, matched without case as the engine does. */
const ERROR_LITERALS = [
  "#DIV/0!",
  "#NULL!",
  "#SPILL!",
  "#CALC!",
  "#VALUE!",
  "#REF!",
  "#NAME?",
  "#NUM!",
  "#N/A",
];
const LONGEST_ERROR_LITERAL = Math.max(...ERROR_LITERALS.map((literal) => literal.length));
/** Code points above this take two UTF-16 units. */
const LAST_SINGLE_UNIT_CODE_POINT = 0xffff;
const SPACE = /\s+/uy;
const NUMBER = /\d+(?:\.\d*)?|\.\d+/y;
const IDENT = /[\p{L}$_\\][\p{L}\p{N}$_.\\]*/uy;

const SINGLE: Readonly<Record<string, RawKind>> = {
  "+": "op",
  "-": "op",
  "*": "op",
  "/": "op",
  "^": "op",
  "&": "op",
  "%": "op",
  "(": "lparen",
  ")": "rparen",
  ",": "comma",
  ";": "semicolon",
  "{": "lbrace",
  "}": "rbrace",
  ":": "colon",
  "!": "bang",
  "#": "hash",
};

/** The end of a quoted run that starts at `from`; a doubled quote is an escaped quote. */
function quotedEnd(text: string, from: number, quote: string): number | null {
  let index = from + 1;
  while (index < text.length) {
    if (text[index] !== quote) {
      index += 1;
    } else if (text[index + 1] === quote) {
      index += 2;
    } else {
      return index + 1;
    }
  }

  return null;
}

/** The end of `[...]` with nested brackets, or null when a bracket stays open. */
function bracketEnd(text: string, from: number): number | null {
  let depth = 0;
  for (let index = from; index < text.length; index++) {
    if (text[index] === "[") depth += 1;
    else if (text[index] === "]") depth -= 1;
    if (depth === 0) return index + 1;
  }

  return null;
}

function sticky(pattern: RegExp, text: string, at: number): number | null {
  pattern.lastIndex = at;
  return pattern.test(text) ? pattern.lastIndex : null;
}

function errorLiteralEnd(text: string, at: number): number | null {
  const rest = text.slice(at, at + LONGEST_ERROR_LITERAL).toUpperCase();
  const literal = ERROR_LITERALS.find((candidate) => rest.startsWith(candidate));

  return literal === undefined ? null : at + literal.length;
}

/** `<`, `<=`, `<>`, `>`, `>=` or `=`, with its length. */
function comparisonEnd(text: string, at: number): number | null {
  const first = text[at];
  if (first !== "<" && first !== ">" && first !== "=") return null;

  const pair = text.slice(at, at + 2);
  return pair === "<=" || pair === ">=" || pair === "<>" ? at + 2 : at + 1;
}

/** The kind and end of the token at `at`, or the lexer error there. */
function scan(text: string, at: number): { kind: RawKind; to: number } | LexError {
  const char = text.charAt(at);
  if (char === '"' || char === "'") {
    const to = quotedEnd(text, at, char);
    if (to !== null) return { kind: char === '"' ? "str" : "quoted", to };

    const what = char === '"' ? "Text" : "The sheet name";
    return {
      from: at,
      to: text.length,
      message: `${what} has no closing quote.`,
      incomplete: true,
    };
  }

  const number = sticky(NUMBER, text, at);
  if (number !== null) return { kind: "num", to: number };

  const error = errorLiteralEnd(text, at);
  if (error !== null) return { kind: "error", to: error };

  if (char === "[") {
    const to = bracketEnd(text, at);
    if (to !== null) return { kind: "structured", to };
    return {
      from: at,
      to: text.length,
      message: "The table reference has no closing ].",
      incomplete: true,
    };
  }

  const ident = sticky(IDENT, text, at);
  if (ident !== null) return { kind: "ident", to: ident };

  const comparison = comparisonEnd(text, at);
  if (comparison !== null) return { kind: "cmp", to: comparison };

  const single = SINGLE[char];
  if (single !== undefined) return { kind: single, to: at + 1 };

  const codePoint = text.codePointAt(at) ?? 0;
  const width = codePoint > LAST_SINGLE_UNIT_CODE_POINT ? 2 : 1;
  const bad = text.slice(at, at + width);
  return {
    from: at,
    to: at + width,
    message: `"${bad}" is not valid in a formula.`,
    incomplete: false,
  };
}

/**
 * Tokens of `text` from offset `start` (after the leading `=`). Lexer errors
 * come back separately; the bad text becomes a `bad` token, so the parser
 * stops there without a second message.
 */
export function lexFormula(
  text: string,
  start: number,
): { tokens: RawToken[]; errors: LexError[] } {
  const tokens: RawToken[] = [];
  const errors: LexError[] = [];

  let at = start;
  let space = false;
  while (at < text.length) {
    const spaceEnd = sticky(SPACE, text, at);
    if (spaceEnd !== null) {
      at = spaceEnd;
      space = true;
      continue;
    }

    const result = scan(text, at);
    const kind = "kind" in result ? result.kind : "bad";
    if (!("kind" in result)) errors.push(result);

    tokens.push({ kind, from: at, to: result.to, text: text.slice(at, result.to), space });
    at = result.to;
    space = false;
  }

  return { tokens, errors };
}
