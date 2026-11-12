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

/** Quoted text, which no OOXML spelling rule changes. */
const XLSX_STRING = String.raw`"(?:[^"]|"")*"`;
/** A cell reference with an optional sheet qualifier, such as `A1` or `'My Sheet'!$B$2`. */
const XLSX_CELL = String.raw`(?:(?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?\$?[A-Za-z]{1,3}\$?[0-9]+(?![A-Za-z0-9_.(#\[])`;
/** A number, never split: digits, a dot or a letter cannot follow it. */
const XLSX_NUMBER = String.raw`(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?(?![0-9.A-Za-z_])`;
/** Range, arithmetic, text and comparison operators, and spaces. */
const XLSX_OPERATOR = "[-+*/^&=<>%: ]";
/**
 * Sources made only of cell and range references, numbers, quoted text and
 * operators. The engine's OOXML spelling rules change only function names,
 * local names, spill references and table references, none of which can occur
 * here, so these sources are their own OOXML spelling.
 */
const PLAIN_XLSX_FORMULA = new RegExp(
  `^=?(?:${XLSX_STRING}|${XLSX_CELL}|${XLSX_NUMBER}|${XLSX_OPERATOR})*$`,
);

/**
 * Convert the workbook's distinct formula sources in one engine call. On
 * export, plain sources skip the call; a workbook with no other formula leaves
 * the engine unloaded.
 */
export async function convertWorkbookFormulas(
  snapshot: WorkbookSnapshot,
  direction: "import" | "export",
): Promise<ReadonlyMap<string, string>> {
  const formulas = workbookFormulaSources(snapshot);
  const pending =
    direction === "export"
      ? formulas.filter((source) => !PLAIN_XLSX_FORMULA.test(source))
      : formulas;
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
