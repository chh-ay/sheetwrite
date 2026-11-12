import type { EngineInstance } from "@sheetwrite/wasm";

import { lendEngine } from "./engine.js";
import { formulaLexes } from "./formula-token-kinds.js";

/** The engine's formula text operations that one XLSX read or write uses. */
export interface XlsxFormulaEngine {
  /** Convert formulas between editor and OOXML spelling, in input order. */
  convert(formulas: string[], direction: "import" | "export"): string[];
  /** Whether the engine's lexer reads all of `formula`; `copy` changes nothing in text it cannot read. */
  lexes(formula: string): boolean;
  /**
   * The formula as a copy `rowDelta` rows down and `colDelta` columns right
   * holds it: the copy rule that paste and fill use. Relative references
   * move, absolute parts stay, whole columns keep their rows, whole rows keep
   * their columns, and a reference that leaves the sheet becomes `#REF!`.
   */
  copy(formula: string, rowDelta: number, colDelta: number): string;
}

/** Adapt the engine's sparse joined batch without round-tripping unchanged strings through WASM. */
function convertSources(
  engine: EngineInstance,
  formulas: string[],
  direction: "import" | "export",
): string[] {
  if (formulas.length === 0) return [];

  const ends = new Uint32Array(formulas.length);
  let length = 0;
  let position = 0;
  for (const source of formulas) {
    length += source.length;
    ends[position++] = length;
  }
  if (length > 0xffff_ffff) {
    throw new RangeError("Sheetwrite: XLSX formula batch exceeds UTF-16 offset capacity");
  }
  const changes = engine.convertXlsxFormulas(formulas.join(""), ends, direction === "export");
  const indices = changes.takeIndices();
  const converted = changes.takeFormulas();
  if (indices.length !== converted.length) {
    throw new Error("Sheetwrite: XLSX formula changes and indices are out of step");
  }

  const results = formulas.slice();
  let indexPosition = 0;
  for (const source of converted) {
    const index = indices[indexPosition++];
    if (index === undefined || index >= results.length) {
      throw new Error("Sheetwrite: XLSX formula change has no input source");
    }
    results[index] = source;
  }
  return results;
}

/**
 * Run `use` with the engine's formula text operations, in one engine
 * session. XLSX codecs can run before `initSheetwrite()`: an initialized
 * document lends its engine, and otherwise a temporary instance releases its
 * memory when `use` returns.
 */
export function withXlsxFormulaEngine<T>(use: (formulas: XlsxFormulaEngine) => T): Promise<T> {
  return lendEngine((engine) =>
    use({
      convert: (formulas, direction) => convertSources(engine, formulas, direction),
      lexes: (formula) => formulaLexes(engine, formula),
      copy: (formula, rowDelta, colDelta) => engine.translateFormula(formula, rowDelta, colDelta),
    }),
  );
}
