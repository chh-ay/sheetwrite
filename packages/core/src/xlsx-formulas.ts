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

/**
 * Run `use` with the engine's formula text operations, in one engine
 * session. XLSX codecs can run before `initSheetwrite()`: an initialized
 * document lends its engine, and otherwise a temporary instance releases its
 * memory when `use` returns.
 */
export function withXlsxFormulaEngine<T>(use: (formulas: XlsxFormulaEngine) => T): Promise<T> {
  return lendEngine((engine) =>
    use({
      convert: (formulas, direction) =>
        engine.convertXlsxFormulas(formulas, direction === "export"),
      lexes: (formula) => formulaLexes(engine, formula),
      copy: (formula, rowDelta, colDelta) => engine.translateFormula(formula, rowDelta, colDelta),
    }),
  );
}
