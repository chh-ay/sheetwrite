// The syntax and call checks of formula help: a recursive-descent parser over
// the formula lexer's tokens that follows the engine grammar in
// packages/wasm/src/calc.rs. It accepts more than the engine where the two
// could disagree, because a false error while typing is worse than a missed
// one: the engine still rejects the formula on commit.

import type { RawToken } from "./formula-tokens.js";
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

/** Binary operators by precedence, lowest first. */
const BINARY_LEVELS: readonly (readonly string[])[] = [
  ["=", "<>", "<", ">", "<=", ">="],
  ["&"],
  ["+", "-"],
  ["*", "/"],
  ["^"],
];

/** Names the engine reads as Excel's future-function prefixes, not as unknown names. */
const FUTURE_FUNCTION_PREFIX = "_XL";

/** Thrown to stop at the first syntax error; the error is already recorded. */
class SyntaxStop extends Error {}

/** A call with its name token and argument count, checked after the parse. */
interface CheckedCall {
  readonly name: RawToken;
  readonly argumentCount: number;
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

/** Recursive-descent parser over the tokens of one formula. */
class FormulaChecker {
  readonly diagnostics: FormulaDiagnostic[] = [];
  /** Names used without a call, such as LET and LAMBDA parameters. */
  private readonly bareNames = new Set<string>();
  private readonly calls: CheckedCall[] = [];
  private index = 0;

  constructor(
    private readonly tokens: readonly RawToken[],
    private readonly textEnd: number,
  ) {}

  run(functions: ReadonlyMap<string, FormulaFunctionMetadata>): void {
    try {
      this.expression();
      const extra = this.peek();
      if (extra !== undefined) {
        this.fail(extra, extra.kind === "rparen" ? "This ) has no matching (." : unexpected(extra));
      }
    } catch (error) {
      if (!(error instanceof SyntaxStop)) throw error;
    }

    this.checkCalls(functions);
  }

  private peek(offset = 0): RawToken | undefined {
    return this.tokens[this.index + offset];
  }

  private next(): RawToken {
    const token = this.tokens[this.index];
    if (token === undefined) throw new Error("formula checker read past the last token");

    this.index += 1;
    return token;
  }

  /** Record a syntax error at `token` (or at the end) and stop the parse. */
  private fail(token: RawToken | undefined, message: string): never {
    // A lexer error already describes a bad token.
    if (token?.kind !== "bad") {
      const from = token?.from ?? this.textEnd;
      const to = token?.to ?? this.textEnd;
      this.diagnostics.push({ from, to, message, incomplete: token === undefined });
    }

    throw new SyntaxStop();
  }

  private expression(level = 0): void {
    const operators = BINARY_LEVELS[level];
    if (operators === undefined) {
      this.postfix();
      return;
    }

    this.expression(level + 1);
    let token = this.peek();
    while (token !== undefined && isOperator(token) && operators.includes(token.text)) {
      this.next();
      this.expression(level + 1);
      token = this.peek();
    }
  }

  private postfix(): void {
    this.unary();
    while (this.peek()?.text === "%") this.next();
  }

  private unary(): void {
    let token = this.peek();
    while (token?.kind === "op" && (token.text === "+" || token.text === "-")) {
      this.next();
      token = this.peek();
    }

    this.reference();
  }

  /** A primary joined by the reference operators `:`, `!`, `#` and the intersection space. */
  private reference(): void {
    this.primary();

    for (let token = this.peek(); token !== undefined; token = this.peek()) {
      if (token.kind === "colon" || token.kind === "bang") {
        this.next();
        this.primary();
      } else if (token.kind === "hash" || (token.kind === "structured" && !token.space)) {
        this.next();
      } else if (token.space && startsReference(token)) {
        this.primary();
      } else {
        return;
      }
    }
  }

  private primary(): void {
    const token = this.peek();
    if (token === undefined) this.fail(token, "Enter a value to complete the formula.");

    switch (token.kind) {
      case "num":
      case "str":
      case "error":
      case "structured":
      case "quoted":
        this.next();
        return;
      case "ident":
        this.next();
        if (this.peek()?.kind === "lparen") this.call(token);
        else this.bareNames.add(token.text.toUpperCase());
        return;
      case "lparen":
        this.group();
        return;
      case "lbrace":
        this.array();
        return;
      default:
        this.fail(token, `Enter a value before "${token.text}".`);
    }
  }

  /** `(expr)` or Excel's union `(A1, B2)`. */
  private group(): void {
    this.next();
    if (this.peek()?.kind === "rparen") this.fail(this.peek(), "Enter a value between ( and ).");

    this.expression();
    while (this.peek()?.kind === "comma") {
      this.next();
      this.expression();
    }

    this.close("rparen", "Add ) to close the (.");
  }

  /** `{1, 2; 3, 4}`: constants split by `,` and `;`. */
  private array(): void {
    this.next();
    for (;;) {
      this.unary();
      const token = this.peek();
      if (token?.kind !== "comma" && token?.kind !== "semicolon") break;
      this.next();
    }

    this.close("rbrace", "Add } to close the array.");
  }

  /** The arguments of a call to `name`; an empty argument (`IF(A1,,2)`) is allowed. */
  private call(name: RawToken): void {
    this.next();
    let argumentCount = 0;
    if (this.peek()?.kind === "rparen") {
      this.next();
    } else {
      argumentCount = this.callArguments(name);
    }

    this.calls.push({ name, argumentCount });

    // A LAMBDA result can be called at once: `LAMBDA(x, x + 1)(2)`.
    while (this.peek()?.kind === "lparen" && !this.peek()?.space) {
      this.next();
      if (this.peek()?.kind === "rparen") this.next();
      else this.callArguments(name);
    }
  }

  private callArguments(name: RawToken): number {
    let count = 0;
    for (;;) {
      const token = this.peek();
      if (token?.kind !== "comma" && token?.kind !== "rparen") this.expression();
      count += 1;

      const separator = this.peek();
      if (separator?.kind === "comma") {
        this.next();
      } else if (separator?.kind === "rparen") {
        this.next();
        return count;
      } else if (separator === undefined) {
        this.fail(separator, `Add ) to close ${name.text.toUpperCase()}.`);
      } else {
        this.fail(separator, unexpected(separator));
      }
    }
  }

  private close(kind: "rparen" | "rbrace", missing: string): void {
    const token = this.peek();
    if (token?.kind === kind) {
      this.next();
      return;
    }

    this.fail(token, token === undefined ? missing : unexpected(token));
  }

  /**
   * Unknown names and argument counts. A called name that the formula also
   * uses bare is a LET or LAMBDA parameter, so it is not unknown.
   */
  private checkCalls(functions: ReadonlyMap<string, FormulaFunctionMetadata>): void {
    if (functions.size === 0) return;

    for (const { name, argumentCount } of this.calls) {
      const key = name.text.toUpperCase();
      const fn = functions.get(key);
      if (fn === undefined) {
        if (!this.bareNames.has(key) && !key.startsWith(FUTURE_FUNCTION_PREFIX)) {
          this.mark(name, `${key} is not a known function. The cell shows #NAME?.`);
        }
        continue;
      }

      const { min, max } = arity(fn.arguments);
      if (argumentCount < min) {
        this.mark(name, `${key} needs at least ${min} ${argumentWord(min)}.`);
      } else if (argumentCount > max) {
        this.mark(name, `${key} takes at most ${max} ${argumentWord(max)}.`);
      }
    }
  }

  private mark(token: RawToken, message: string): void {
    this.diagnostics.push({ from: token.from, to: token.to, message, incomplete: false });
  }
}

function isOperator(token: RawToken): boolean {
  return token.kind === "op" || token.kind === "cmp";
}

/** Tokens that start a reference after a space, which makes the space an intersection. */
function startsReference(token: RawToken): boolean {
  return (
    token.kind === "ident" ||
    token.kind === "quoted" ||
    token.kind === "lparen" ||
    (token.kind === "error" && token.text.toUpperCase() === "#REF!")
  );
}

function unexpected(token: RawToken): string {
  return `"${token.text}" is not expected here.`;
}

/**
 * Syntax errors, unknown functions and wrong argument counts in the tokens of
 * one formula. Only the first syntax error is reported, because later ones
 * usually follow from it. Call checks need `functions`; with none, they are
 * skipped.
 */
export function checkFormula(
  tokens: readonly RawToken[],
  textEnd: number,
  functions: ReadonlyMap<string, FormulaFunctionMetadata>,
): FormulaDiagnostic[] {
  const checker = new FormulaChecker(tokens, textEnd);
  checker.run(functions);

  return checker.diagnostics.sort((left, right) => left.from - right.from);
}
