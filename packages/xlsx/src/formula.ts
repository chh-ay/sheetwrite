import { convertXlsxFormulas, type WorkbookSnapshot } from "@sheetwrite/core";

const EXTERNAL_DATA_FUNCTION =
  /(^|[^A-Z0-9_.])(?:_xlfn\.)?(DDE|RTD|WEBSERVICE|FILTERXML|CUBEMEMBER|CUBEVALUE|CUBESET|CUBESETCOUNT|CUBERANKEDMEMBER)\s*\(/i;
const EXTERNAL_BOOK_TOKEN = /\[(?:\d+|[^\]]+\.(?:xlsx?|xlsm|xlsb|xlam|ods|csv))\]/i;

/** Detect formula constructs that would keep an external workbook/data source live. */
export function formulaContainsExternalReference(formula: string): boolean {
  let executable = "";
  for (let index = 0; index < formula.length;) {
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

/** Deduplicate cell and name sources before the workbook's one engine call. */
export async function convertWorkbookFormulas(
  snapshot: WorkbookSnapshot,
  direction: "import" | "export",
): Promise<ReadonlyMap<string, string>> {
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
  const formulas = [...sources];
  const converted = await convertXlsxFormulas(formulas, direction);
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
