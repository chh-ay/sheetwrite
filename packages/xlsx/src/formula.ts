import {
  type WorkbookSnapshot,
  withXlsxFormulaEngine,
  type XlsxFormulaEngine,
} from "@sheetwrite/core";

/** The distinct cell and defined-name formula sources of a workbook. */
export function workbookFormulaSources(snapshot: WorkbookSnapshot): string[] {
  const sources = new Set<string>();
  for (const sheet of snapshot.sheets) {
    for (const block of sheet.cells) {
      for (const cell of block.cells) {
        if (cell.value.kind === "formula") sources.add(cell.value.src);
      }
    }
  }
  for (const named of snapshot.workbook.namedRanges ?? []) {
    if (named.formula !== undefined) sources.add(named.formula);
  }
  return [...sources];
}

/** Each distinct source and its conversion, from one engine call. */
export function convertFormulaSources(
  engine: XlsxFormulaEngine,
  formulas: string[],
  direction: "import" | "export",
): ReadonlyMap<string, string> {
  const converted = engine.convert(formulas, direction);
  const results = new Map<string, string>();
  for (let index = 0; index < formulas.length; index += 1) {
    const source = formulas[index];
    const result = converted[index];
    if (source === undefined || result === undefined) {
      throw new Error("Missing converted workbook formula");
    }
    results.set(source, result);
  }
  return results;
}

/**
 * Whether a source's OOXML spelling can differ from it. The export rule
 * (`formula_to_xlsx` in the engine) only prefixes a name followed by `(` and
 * rewrites a reference followed by `#`; a source with neither is already its
 * own OOXML spelling.
 */
function mayGainXlsxSpelling(source: string): boolean {
  return source.includes("(") || source.includes("#");
}

/**
 * Convert the workbook's distinct formula sources in one engine call. On
 * export, sources the engine would return unchanged skip the call; a workbook
 * with no other formula leaves the engine unloaded.
 */
export async function convertWorkbookFormulas(
  snapshot: WorkbookSnapshot,
  direction: "import" | "export",
): Promise<ReadonlyMap<string, string>> {
  const formulas = workbookFormulaSources(snapshot);
  const pending =
    direction === "export" ? formulas.filter((source) => mayGainXlsxSpelling(source)) : formulas;
  const converted =
    pending.length === 0
      ? new Map<string, string>()
      : await withXlsxFormulaEngine((engine) => convertFormulaSources(engine, pending, direction));
  if (pending.length === formulas.length) return converted;

  const results = new Map(converted);
  for (const source of formulas) {
    if (!results.has(source)) results.set(source, source);
  }
  return results;
}
