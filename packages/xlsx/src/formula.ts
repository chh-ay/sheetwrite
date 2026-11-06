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
function closingBracket(formula: string, open: number): number {
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
function closingQuote(formula: string, open: number, quote: string): number {
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
function quotedNameHasExternalBook(name: string): boolean {
  const open = name.indexOf("[");
  const close = name.indexOf("]", open);
  return open >= 0 && close > open && EXTERNAL_BOOK.test(name.slice(open + 1, close));
}

/**
 * Whether the `[...]` from `open` to `end` qualifies a sheet or name in another
 * workbook (`[1]Sheet1!A1`, `[1]!Name`), rather than a structured reference
 * such as `Sales[2023]` or `[@2023]`.
 */
function isExternalBook(formula: string, open: number, end: number): boolean {
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
      index = closingQuote(formula, index, '"');
      continue;
    }

    if (char === "'") {
      const end = closingQuote(formula, index, "'");
      if (quotedNameHasExternalBook(formula.slice(index + 1, end - 1))) return true;
      executable += " ";
      index = end;
      continue;
    }

    if (char === "[") {
      const end = closingBracket(formula, index);
      if (isExternalBook(formula, index, end)) return true;
      executable += " ";
      index = end;
      continue;
    }

    executable += char;
    index += 1;
  }
  return EXTERNAL_DATA_FUNCTION.test(executable);
}

/** Whether the formula calls a function that reads live external data, such as `RTD` or `DDE`. */
export function formulaCallsExternalData(formula: string): boolean {
  return EXTERNAL_DATA_FUNCTION.test(formula.replace(/"(?:[^"]|"")*"?/g, " "));
}

/** A sheet of another workbook as a formula names it. */
export interface ExternalSheetName {
  /** The text in brackets: a link index such as `1`, or a file name such as `Budget.xlsx`. */
  readonly book: string;
  /** The sheet name, or `""` for a defined name of the other workbook (`[1]!Total`). */
  readonly sheet: string;
}

/** Characters of a sheet name that Excel writes without quotes after `[book]`. */
const PLAIN_SHEET_NAME = /^[\p{L}\p{N}_.\\]*/u;
/** Characters of a book or sheet name that Excel writes without quotes. */
const PLAIN_NAME = /^[\p{L}\p{N}_.]+$/u;

/** `[book]sheet`, in quotes when either part needs them, as Excel writes it before `!`. */
export function externalSheetText(book: string, sheet: string): string {
  const text = `[${book}]${sheet}`;
  if (PLAIN_NAME.test(book) && PLAIN_NAME.test(sheet)) return text;
  return `'${text.replaceAll("'", "''")}'`;
}

/**
 * The formula with each sheet of another workbook replaced by `replace`,
 * which returns the new text before `!`, or undefined when the formula cannot
 * be written that way. Text in quotes and structured references stay as they
 * are. A folder before `[` in a quoted name is left out.
 */
export function rewriteExternalSheets(
  formula: string,
  replace: (name: ExternalSheetName) => string | undefined,
): string | undefined {
  let output = "";
  let index = 0;
  while (index < formula.length) {
    const char = formula.charAt(index);
    let end = index + 1;
    let name: ExternalSheetName | undefined;
    if (char === '"') {
      end = closingQuote(formula, index, '"');
    } else if (char === "'") {
      end = closingQuote(formula, index, "'");
      const quoted = formula.slice(index + 1, end - 1).replaceAll("''", "'");
      const open = quoted.indexOf("[");
      const close = quoted.indexOf("]", open);
      if (quotedNameHasExternalBook(quoted)) {
        name = { book: quoted.slice(open + 1, close), sheet: quoted.slice(close + 1) };
      }
    } else if (char === "[") {
      end = closingBracket(formula, index);
      if (isExternalBook(formula, index, end)) {
        const sheet = PLAIN_SHEET_NAME.exec(formula.slice(end))?.[0] ?? "";
        name = { book: formula.slice(index + 1, end - 1), sheet };
        end += sheet.length;
      }
    }

    if (name) {
      const replacement = replace(name);
      if (replacement === undefined) return undefined;
      output += replacement;
    } else {
      output += formula.slice(index, end);
    }
    index = end;
  }
  return output;
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
