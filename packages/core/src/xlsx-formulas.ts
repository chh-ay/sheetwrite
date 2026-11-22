import type { EngineInstance } from "@sheetwrite/wasm";

import { lendEngine } from "./engine.js";
import { formulaLexes } from "./formula-token-kinds.js";

/** The engine's formula text operations that one XLSX read or write uses. */
export interface XlsxFormulaEngine {
  /** Convert formulas between editor and OOXML spelling, in input order. */
  convert(formulas: string[], direction: "import" | "export"): string[];
  /**
   * The indices of the editor-spelling `formulas` whose result is an array,
   * ascending. Each is read without a workbook, so a name never counts.
   */
  arrayFormulas(formulas: string[]): Uint32Array;
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

/** The formulas as one string and the UTF-16 end of each, as the engine's batch calls take them. */
function joined_sources(formulas: string[]): { joined: string; ends: Uint32Array } {
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
  return { joined: formulas.join(""), ends };
}

/** Adapt the engine's sparse joined batch without round-tripping unchanged strings through WASM. */
function convert_sources(
  engine: EngineInstance,
  formulas: string[],
  direction: "import" | "export",
): string[] {
  if (formulas.length === 0) return [];

  const { joined, ends } = joined_sources(formulas);
  const indices = new Uint32Array(formulas.length);
  const converted = engine.convertXlsxFormulas(joined, ends, direction === "export", indices);

  const results = formulas.slice();
  let index_position = 0;
  for (const source of converted) {
    const index = indices[index_position++];
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
 *
 * @param use - Called once with the formula operations; do not keep them after it returns.
 * @returns A promise of what `use` returned.
 */
export function withXlsxFormulaEngine<T>(use: (formulas: XlsxFormulaEngine) => T): Promise<T> {
  return lendEngine((engine) =>
    use({
      convert: (formulas, direction) => convert_sources(engine, formulas, direction),
      arrayFormulas: (formulas) => {
        if (formulas.length === 0) return new Uint32Array();
        const { joined, ends } = joined_sources(formulas);
        return engine.xlsxArrayFormulas(joined, ends);
      },
      lexes: (formula) => formulaLexes(engine, formula),
      copy: (formula, row_delta, col_delta) =>
        engine.translateFormula(formula, row_delta, col_delta),
    }),
  );
}
