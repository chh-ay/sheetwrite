/** A scalar passed to or returned from a synchronous host formula function. */
export type FormulaScalar = number | string | boolean | null;

/** Ranges use row-major nested arrays. Scalar expressions use a scalar. */
export type FormulaArgument = FormulaScalar | readonly (readonly FormulaScalar[])[];

/** Argument documentation used by built-in and host functions. Types are descriptive, not coercion rules. */
export interface FormulaArgumentMetadata {
  readonly name: string;
  readonly types: readonly string[];
  readonly optional?: boolean;
  readonly repeating?: boolean;
}

/** One metadata format for built-in and host functions. */
export interface FormulaFunctionMetadata {
  readonly name: string;
  readonly description: string;
  readonly arguments: readonly FormulaArgumentMetadata[];
  readonly returnKind: string;
  readonly examples?: readonly string[];
  readonly volatile?: boolean;
}

/** Built-in metadata also names the engines that include the function. */
export interface BuiltInFormulaFunctionMetadata extends FormulaFunctionMetadata {
  readonly builds: readonly string[];
}

/** A synchronous host function. Promises and other non-scalar results become `#VALUE!`. */
export type FormulaFunction = (...arguments_: readonly FormulaArgument[]) => FormulaScalar;
