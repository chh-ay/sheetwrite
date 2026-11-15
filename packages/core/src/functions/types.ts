/** A scalar passed to or returned from a synchronous host formula function. */
export type FormulaScalar = number | string | boolean | null;

/** Ranges use row-major nested arrays. Scalar expressions use a scalar. */
export type FormulaArgument = FormulaScalar | readonly (readonly FormulaScalar[])[];

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
    readonly arguments: readonly FormulaArgumentMetadata[];
    readonly returnKind: string;
  }[];
  /** Each row holds the name, family index, signature index, and engine/volatility flags. */
  readonly functions: readonly (readonly [string, number, number, number])[];
}
