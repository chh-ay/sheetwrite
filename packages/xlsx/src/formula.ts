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

/** What the writer needs to know of a workbook's formulas. */
export interface ExportFormulas {
  /** The OOXML spelling of each distinct cell and defined-name formula source. */
  readonly formulas: ReadonlyMap<string, string>;
  /** The sources whose result is an array, which Excel needs marked as dynamic arrays. */
  readonly arrayFormulas: ReadonlySet<string>;
}

/**
 * Convert the workbook's distinct formula sources to OOXML spelling and find
 * those whose result is an array, in one engine session. Plain sources keep
 * their spelling, and only a range can make one an array, so a plain source
 * without `:` skips the engine; a workbook with no other formula leaves the
 * engine unloaded.
 */
export async function exportWorkbookFormulas(snapshot: WorkbookSnapshot): Promise<ExportFormulas> {
  const sources = workbookFormulaSources(snapshot);
  const pending = sources.filter(
    (source) => source.includes(":") || !PLAIN_XLSX_FORMULA.test(source),
  );
  const array_formulas = new Set<string>();
  const converted =
    pending.length === 0
      ? new Map<string, string>()
      : await withXlsxFormulaEngine((engine) => {
          for (const index of engine.arrayFormulas(pending)) {
            const source = pending[index];
            if (source !== undefined) array_formulas.add(source);
          }
          return convertFormulaSources(engine, pending, "export");
        });
  if (pending.length === sources.length)
    return { formulas: converted, arrayFormulas: array_formulas };

  const formulas = new Map(converted);
  for (const source of sources) {
    if (!formulas.has(source)) formulas.set(source, source);
  }
  return { formulas, arrayFormulas: array_formulas };
}
