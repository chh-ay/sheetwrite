/** A scalar passed to or returned from a synchronous host formula function. */
export type FormulaScalar = number | string | boolean | null;

/** Ranges use row-major nested arrays. Scalar expressions use a scalar. */
export type FormulaArgument = FormulaScalar | readonly (readonly FormulaScalar[])[];

/** One value an argument takes, as Excel's Formula AutoComplete lists it: `FALSE` - `Exact match`. */
export interface FormulaArgumentChoice {
  /** The value as it is typed in the formula, such as `FALSE`, `-1` or `"address"`. */
  readonly value: string;
  /** What the value means, such as `Exact match`. */
  readonly description: string;
}

/** Argument documentation used by built-in and host functions. Types are descriptive, not coercion rules. */
export interface FormulaArgumentMetadata {
  /** Argument name shown in formula help, such as `region`. */
  readonly name: string;
  /** Kinds of value the argument takes, such as `["number", "range"]`; shown in help only. */
  readonly types: readonly string[];
  /** Whether the argument can be left out. */
  readonly optional?: boolean;
  /** Whether the argument can be given any number of times, like `SUM`'s values. */
  readonly repeating?: boolean;
  /**
   * The values the argument takes, which formula help lists when the cursor
   * reaches it, as Excel does for `VLOOKUP`'s `range_lookup`.
   */
  readonly choices?: readonly FormulaArgumentChoice[];
}

/** One metadata format for built-in and host functions. */
export interface FormulaFunctionMetadata {
  /** Function name as typed in formulas, such as `TAXRATE`. */
  readonly name: string;
  /** One sentence for formula help: what the function returns. */
  readonly description: string;
  /** The arguments, in call order. */
  readonly arguments: readonly FormulaArgumentMetadata[];
  /** Kind of value returned, such as `"number"`; shown in help only. */
  readonly returnKind: string;
  /** Example formulas for help, such as `=TAXRATE("EU")`. */
  readonly examples?: readonly string[];
  /** Whether the function's result can change at every recalculation, like `NOW`. */
  readonly volatile?: boolean;
}

/** A synchronous host function. Promises and other non-scalar results become `#VALUE!`. */
export type FormulaFunction = (...arguments_: readonly FormulaArgument[]) => FormulaScalar;

/** Compact generated rows keep repeated descriptions and signatures out of the lazy chunk. */
export interface BuiltInFunctionTable {
  readonly families: readonly string[];
  readonly profiles: readonly {
    readonly arguments: readonly Omit<FormulaArgumentMetadata, "name">[];
    readonly returnKind: string;
  }[];
  /** Excel's argument names, one list per distinct naming of a profile's arguments. */
  readonly argumentNames: readonly (readonly string[])[];
  /**
   * Each row holds the name, family index, signature index, engine/volatility
   * flags and argument names index.
   */
  readonly functions: readonly (readonly [string, number, number, number, number])[];
}
