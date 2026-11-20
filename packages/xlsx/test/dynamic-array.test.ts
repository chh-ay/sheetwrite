import { beforeAll, describe, expect, it } from "bun:test";

import {
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  toXlsxWorkbook,
} from "@sheetwrite/core";

import { xlsxAddon } from "../src/index.js";
import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import { packageProblems, rawXlsx, TRANSITIONAL_REL, worksheet } from "./raw-opc.js";
import {
  book,
  cellsOf,
  collectWarnings,
  formula,
  partNames,
  partText,
  sheet,
} from "./workbook-fixtures.js";

/** `xl/metadata.xml` of `dynamic_array02.xlsx`, a file Excel 365 saved (XlsxWriter's comparison corpus). */
const EXCEL_METADATA =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray"><metadataTypes count="1"><metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/></metadataTypes><futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata><cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata></metadata>';

/** A1 spills `=SEQUENCE(3)` down to A3; B1 holds one value. */
const spillBook = () =>
  book([sheet("s1", "Spill", [[formula("=SEQUENCE(3)"), formula("=SUM(1,2)")]], { rowCount: 4 })]);

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

describe("dynamic arrays in XLSX", () => {
  it("marks a formula whose result is an array as Excel's dynamic array, and leaves others plain", async () => {
    const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(spillBook());
    const xml = partText(bytes, "xl/worksheets/sheet1.xml");

    expect(xml).toContain('<c r="A1" cm="1"><f t="array" ref="A1">_xlfn.SEQUENCE(3)</f></c>');
    expect(xml).toContain('<c r="B1"><f>SUM(1,2)</f></c>');
    expect(partText(bytes, "xl/metadata.xml")).toBe(EXCEL_METADATA);
    expect(partText(bytes, "[Content_Types].xml")).toContain(
      '<Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/>',
    );
    expect(partText(bytes, "xl/_rels/workbook.xml.rels")).toContain(
      `Type="${TRANSITIONAL_REL}/sheetMetadata" Target="metadata.xml"`,
    );
    expect(packageProblems(bytes)).toEqual([]);

    const plain = await sheetwriteWorkbookBackend.toXlsxWorkbook(
      book([sheet("s1", "Plain", [[formula("=SUM(1,2)")]])]),
    );
    expect(partText(plain, "xl/worksheets/sheet1.xml")).not.toContain("cm=");
    expect(partNames(plain)).not.toContain("xl/metadata.xml");
  });

  it("writes a grid's spill with Excel's range and cached values, and reads it back as the same spill", async () => {
    const store = SheetwriteStore.fromSnapshot(spillBook());
    const bytes = await toXlsxWorkbook(store);
    store.dispose();
    const xml = partText(bytes, "xl/worksheets/sheet1.xml");

    expect(xml).toContain(
      '<c r="A1" cm="1"><f t="array" ref="A1:A3">_xlfn.SEQUENCE(3)</f><v>1</v></c>',
    );
    expect(xml).toContain('<c r="A2"><v>2</v></c>');
    expect(xml).toContain('<c r="A3"><v>3</v></c>');

    const imported = await fromXlsxWorkbook(bytes);
    expect(
      cellsOf(imported)
        .filter((cell) => cell.col === 0)
        .map(({ row, value }) => ({ row, value })),
    ).toEqual([{ row: 0, value: formula("=SEQUENCE(3)") }]);
    const restored = SheetwriteStore.fromSnapshot(imported);
    const column = [0, 1, 2].map((row) => restored.getCell({ sheet: "s1", row, col: 0 }).resolved);
    restored.dispose();
    expect(column).toEqual([1, 2, 3]);
  });

  it("reads Excel's dynamic arrays as spills and keeps legacy array formulas as they were", async () => {
    const bytes = rawXlsx({
      sheets: [
        {
          xml: worksheet(
            '<sheetData><row r="1"><c r="A1" cm="1"><f t="array" ref="A1:A3">_xlfn.SEQUENCE(3)</f><v>1</v></c><c r="C1"><f t="array" ref="C1:C2">ROW(A1:A2)</f><v>1</v></c></row>' +
              '<row r="2"><c r="A2"><v>2</v></c><c r="C2"><v>2</v></c></row><row r="3"><c r="A3"><v>3</v></c></row></sheetData>',
          ),
        },
      ],
      workbookRelationships: `<Relationship Id="rId2" Type="${TRANSITIONAL_REL}/sheetMetadata" Target="metadata.xml"/>`,
      extraFiles: { "xl/metadata.xml": EXCEL_METADATA },
      extraOverrides: [
        '<Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/>',
      ],
    });
    const { warnings, onWarning } = collectWarnings();

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes, { onWarning });

    // The covered cells A2:A3 keep no value: the spill fills them again.
    const values = cellsOf(imported)
      .filter(({ value }) => value.kind !== "literal" || value.value !== null)
      .map(({ row, col, value }) => ({ row, col, value }));
    expect(values).toEqual([
      { row: 0, col: 0, value: formula("=SEQUENCE(3)") },
      { row: 0, col: 2, value: { kind: "literal", value: "=ROW(A1:A2)" } },
      { row: 1, col: 2, value: { kind: "literal", value: 2 } },
    ]);
    expect(warnings.map((warning) => [warning.cell, warning.message])).toEqual([
      ["C1", "Excel array formula was neutralized because its range semantics are unsupported"],
    ]);
  });
});
