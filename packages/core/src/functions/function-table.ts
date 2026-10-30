import type { FormulaArgumentMetadata } from "./types.js";

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
