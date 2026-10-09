import { beforeAll, describe, expect, it } from "bun:test";
import {
  fromXlsxWorkbook,
  initSheetwrite,
  toXlsxWorkbook,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { strFromU8, unzipSync } from "fflate";
import { registerXlsxBackends } from "../src/index.js";

interface FormulaContractInventory {
  functions: {
    canonical: string;
    contractStatus: string;
  }[];
}

const INVENTORY = (await Bun.file(
  new URL("../../../test/conformance/formula-contract.inventory.json", import.meta.url),
).json()) as FormulaContractInventory;
const FORMULA_SOURCES = INVENTORY.functions
  .filter((entry) => entry.contractStatus === "required-supported")
  .map((entry) => `=${entry.canonical}()`);
FORMULA_SOURCES.push("={1,2;3,4}", "=SUM({1,2,3})", '={"A1",TRUE,#N/A}');
beforeAll(async () => {
  await initSheetwrite();
  registerXlsxBackends();
});

function formulaWorkbook(sources: readonly string[] = FORMULA_SOURCES): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: "formula-source-preservation",
    version: 1,
    workbook: { activeSheet: "formula" },
    sheets: [
      {
        id: "formula",
        name: "Formula Source",
        order: 0,
        rowCount: sources.length,
        columns: [{ key: "formula", header: "Formula", width: 180, type: "number" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: sources.length,
            colCount: 1,
            cells: sources.map((src, rowOffset) => ({
              rowOffset,
              colOffset: 0,
              value: { kind: "formula" as const, src },
            })),
          },
        ],
      },
    ],
  };
}

function formulaSources(snapshot: WorkbookSnapshot): string[] {
  return snapshot.sheets[0]!.cells.flatMap((block) =>
    block.cells.flatMap((cell) => (cell.value.kind === "formula" ? [cell.value.src] : [])),
  );
}

describe("XLSX formula source preservation", () => {
  it("round-trips every required target source without asserting recalculation or producer compatibility", async () => {
    const encoded = await toXlsxWorkbook(formulaWorkbook());
    const decoded = await fromXlsxWorkbook(encoded);
    expect(FORMULA_SOURCES.length).toBeGreaterThan(0);
    expect(new Set(FORMULA_SOURCES).size).toBe(FORMULA_SOURCES.length);

    expect(decoded.workbook.activeSheet).toBe("formula");
    expect(decoded.sheets).toHaveLength(1);
    expect(decoded.sheets[0]).toMatchObject({
      id: "formula",
      name: "Formula Source",
      order: 0,
      rowCount: FORMULA_SOURCES.length,
    });
    expect(formulaSources(decoded)).toEqual(FORMULA_SOURCES);
  });

  it("writes spill references in Excel's ANCHORARRAY form and reads them back", async () => {
    const sources = ["=SUM(A1#)", "='My Sheet'!$B$2#", '=LEN("A1#")&C3#'];
    const encoded = await toXlsxWorkbook(formulaWorkbook(sources));
    const worksheet = strFromU8(unzipSync(encoded)["xl/worksheets/sheet1.xml"]!);
    expect(worksheet).toContain("<f>SUM(_xlfn.ANCHORARRAY(A1))</f>");
    expect(worksheet).toContain("<f>_xlfn.ANCHORARRAY(&apos;My Sheet&apos;!$B$2)</f>");
    // The quoted text is not a reference and keeps its `#`.
    expect(worksheet).toContain("A1#&quot;)&amp;_xlfn.ANCHORARRAY(C3)");
    expect(formulaSources(await fromXlsxWorkbook(encoded))).toEqual(sources);
  });
});
