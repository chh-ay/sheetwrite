const EXTERNAL_DATA_FUNCTION =
  /(^|[^A-Z0-9_.])(DDE|RTD|WEBSERVICE|FILTERXML|CUBEMEMBER|CUBEVALUE|CUBESET|CUBESETCOUNT|CUBERANKEDMEMBER)\s*\(/i;
const EXTERNAL_BOOK_TOKEN = /\[(?:\d+|[^\]]+\.(?:xlsx?|xlsm|xlsb|xlam|ods|csv))\]/i;

/** Detect formula constructs that would keep an external workbook/data source live. */
export function formulaContainsExternalReference(formula: string): boolean {
  let executable = "";
  for (let index = 0; index < formula.length; ) {
    if (formula[index] !== '"') {
      executable += formula[index]!;
      index += 1;
      continue;
    }
    executable += " ";
    index += 1;
    while (index < formula.length) {
      if (formula[index] === '"' && formula[index + 1] === '"') {
        index += 2;
      } else if (formula[index] === '"') {
        index += 1;
        break;
      } else {
        index += 1;
      }
    }
  }
  return EXTERNAL_BOOK_TOKEN.test(executable) || EXTERNAL_DATA_FUNCTION.test(executable);
}

/** A cell reference with an optional sheet qualifier, such as `A1` or `'My Sheet'!$B$2`. */
const CELL_REFERENCE = String.raw`(?:(?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?\$?[A-Za-z]{1,3}\$?[0-9]+`;
/** Text in double quotes, which the conversions must leave unchanged. */
const QUOTED_TEXT = `"(?:[^"]|"")*"`;
const XLSX_SPILL_REFERENCE = new RegExp(
  String.raw`${QUOTED_TEXT}|_xlfn\.ANCHORARRAY\(\s*(${CELL_REFERENCE})\s*\)`,
  "gi",
);
const SPILL_REFERENCE = new RegExp(`${QUOTED_TEXT}|(${CELL_REFERENCE})#`, "g");

/**
 * Excel stores the spill reference `A1#` as `_xlfn.ANCHORARRAY(A1)`. Convert
 * that form to `A1#` when a workbook is read.
 */
export function spillReferencesFromXlsx(formula: string): string {
  return formula.replace(XLSX_SPILL_REFERENCE, (match, reference?: string) =>
    reference === undefined ? match : `${reference}#`,
  );
}

/** Convert `A1#` back to `_xlfn.ANCHORARRAY(A1)` when a workbook is written. */
export function spillReferencesToXlsx(formula: string): string {
  return formula.replace(
    SPILL_REFERENCE,
    (match, reference: string | undefined, offset: number, full: string) => {
      if (reference === undefined) return match;
      // A reference glued to a name, such as `LOG10#`, is not a cell reference.
      const previous = offset > 0 ? full.charAt(offset - 1) : "";
      if (/[A-Za-z0-9_.]/.test(previous)) return match;
      return `_xlfn.ANCHORARRAY(${reference})`;
    },
  );
}
