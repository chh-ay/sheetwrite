import {
  type WorkbookSnapshot,
  withXlsxFormulaEngine,
  type XlsxFormulaEngine,
} from "@sheetwrite/core";

const EXTERNAL_DATA_FUNCTION =
  /(^|[^A-Z0-9_.])(?:_xlfn\.)?(DDE|RTD|WEBSERVICE|FILTERXML|CUBEMEMBER|CUBEVALUE|CUBESET|CUBESETCOUNT|CUBERANKEDMEMBER)\s*\(/i;
/** An external-book qualifier: a link index (`[1]`) or a workbook file name (`[Budget.xlsx]`). */
const EXTERNAL_BOOK = /^(?:\d+|[^\]]+\.(?:xlsx?|xlsm|xlsb|xlam|ods|csv))$/i;
/** Characters that end a table name, so a following `[` opens a structured reference. */
const TABLE_NAME_END = /[\p{L}\p{N}_.\\]/u;
/** Characters that start the sheet name or `!` after an external-book qualifier. */
const QUALIFIED_NAME_START = /[\p{L}_\\!']/u;

/**
 * Index after the bracket that closes the `[` at `open`. Brackets nest, and
 * `'` escapes the next character, as in a structured reference.
 */
function closing_bracket(formula: string, open: number): number {
  let depth = 0;
  let index = open;
  while (index < formula.length) {
    const char = formula.charAt(index);
    if (char === "'") {
      index += 2;
      continue;
    }

    index += 1;
    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;
    if (depth === 0) return index;
  }
  return index;
}

/** Index after the quote that closes the `quote` at `open`; a doubled quote is one character. */
function closing_quote(formula: string, open: number, quote: string): number {
  let index = open + 1;
  while (index < formula.length) {
    if (formula.charAt(index) !== quote) {
      index += 1;
    } else if (formula.charAt(index + 1) === quote) {
      index += 2;
    } else {
      return index + 1;
    }
  }
  return index;
}

/** Whether a quoted sheet name, such as `'C:\Books\[Budget.xlsx]Annual'`, names another workbook. */
function quoted_name_has_external_book(name: string): boolean {
  const open = name.indexOf("[");
  const close = name.indexOf("]", open);
  return open >= 0 && close > open && EXTERNAL_BOOK.test(name.slice(open + 1, close));
}

/**
 * Whether the `[...]` from `open` to `end` qualifies a sheet or name in another
 * workbook (`[1]Sheet1!A1`, `[1]!Name`), rather than a structured reference
 * such as `Sales[2023]` or `[@2023]`.
 */
function is_external_book(formula: string, open: number, end: number): boolean {
  if (open > 0 && TABLE_NAME_END.test(formula.charAt(open - 1))) return false;

  const content = formula.slice(open + 1, end - 1);
  return EXTERNAL_BOOK.test(content) && QUALIFIED_NAME_START.test(formula.charAt(end));
}

/** Detect formula constructs that would keep an external workbook/data source live. */
export function formulaContainsExternalReference(formula: string): boolean {
  let executable = "";
  let index = 0;
  while (index < formula.length) {
    const char = formula.charAt(index);
    if (char === '"') {
      executable += " ";
      index = closing_quote(formula, index, '"');
      continue;
    }

    if (char === "'") {
      const end = closing_quote(formula, index, "'");
      if (quoted_name_has_external_book(formula.slice(index + 1, end - 1))) return true;
      executable += " ";
      index = end;
      continue;
    }

    if (char === "[") {
      const end = closing_bracket(formula, index);
      if (is_external_book(formula, index, end)) return true;
      executable += " ";
      index = end;
      continue;
    }

    executable += char;
    index += 1;
  }
  return EXTERNAL_DATA_FUNCTION.test(executable);
}

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
 * Convert the workbook's distinct formula sources in one engine call. A
 * workbook without formulas leaves the engine unloaded.
 */
export async function convertWorkbookFormulas(
  snapshot: WorkbookSnapshot,
  direction: "import" | "export",
): Promise<ReadonlyMap<string, string>> {
  const formulas = workbookFormulaSources(snapshot);
  if (formulas.length === 0) return new Map();

  return withXlsxFormulaEngine((engine) => convertFormulaSources(engine, formulas, direction));
}
