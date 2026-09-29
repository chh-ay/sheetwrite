import { describe, expect, it } from "bun:test";
import type { WorkbookSnapshot, XlsxWorkbookWarning } from "@sheetwrite/core";
import { strFromU8, unzipSync } from "fflate";
import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import { rawXlsx, TRANSITIONAL_MAIN, TRANSITIONAL_REL, worksheet } from "./raw-opc.js";

const TABLE_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml";

function nativeTablePackage(tableXml: string, workbookExtra = ""): Uint8Array {
  return rawXlsx({
    sheets: [
      {
        name: "Raw",
        xml: worksheet(
          '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Amount</t></is></c></row></sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts>',
        ),
        relationships: `<Relationship Id="rId1" Type="${TRANSITIONAL_REL}/table" Target="../tables/table1.xml"/>`,
      },
    ],
    workbookExtra,
    extraOverrides: [`<Override PartName="/xl/tables/table1.xml" ContentType="${TABLE_CONTENT}"/>`],
    extraFiles: { "xl/tables/table1.xml": tableXml },
  });
}

function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "sheet-stable" },
    sheets: [
      {
        id: "sheet-stable",
        name: "Data",
        order: 0,
        rowCount: 4,
        columns: [{ key: "amount", header: "Amount", width: 80, type: "number" }],
        tables: [
          {
            id: "table-stable",
            name: "Sales",
            range: {
              sheet: "sheet-stable",
              start: { row: 0, col: 0 },
              end: { row: 3, col: 0 },
            },
            columns: [{ id: "column-stable", name: "Amount", totalsRowLabel: "Total" }],
            headerRow: true,
            totalsRow: true,
            style: { name: "TableStyleMedium2", showRowStripes: true },
          },
        ],
        cells: [],
      },
    ],
  };
}

describe("native XLSX workbook tables", () => {
  it("round-trips Sheetwrite stable identities through native table parts and sidecar metadata", async () => {
    const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot());
    const parts = unzipSync(bytes);
    const tableXml = strFromU8(parts["xl/tables/table1.xml"]!);
    const sheetXml = strFromU8(parts["xl/worksheets/sheet1.xml"]!);

    expect(sheetXml).toContain('<tableParts count="1"><tablePart r:id="rId3"/></tableParts>');
    expect(tableXml).toContain('displayName="Sales"');
    expect(tableXml).toContain('ref="A1:A4"');
    expect(tableXml).toContain('totalsRowLabel="Total"');
    expect(tableXml).toContain('name="TableStyleMedium2"');

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    expect(imported.sheets[0]!.tables).toEqual(snapshot().sheets[0]!.tables);
  });

  it("drops a native table that collides with a defined name and emits an exact ambiguity warning", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const bytes = nativeTablePackage(
      `<?xml version="1.0"?><table xmlns="${TRANSITIONAL_MAIN}" id="1" displayName="sales" ref="A1:A2"><tableColumns count="1"><tableColumn id="1" name="Amount"/></tableColumns></table>`,
      '<definedNames><definedName name="Sales">Raw!$A$1</definedName></definedNames>',
    );
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes, {
      onWarning: (warning) => warnings.push(warning),
    });

    expect(imported.sheets[0]!.tables).toBeUndefined();
    expect(imported.workbook.namedRanges?.[0]?.name).toBe("Sales");
    expect(warnings.at(-1)?.message).toBe(
      "Excel table sales was dropped because its name conflicts case-insensitively with workbook defined name Sales; the defined name was retained to keep formula resolution unambiguous",
    );
  });
});
