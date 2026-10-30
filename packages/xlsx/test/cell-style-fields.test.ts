import { describe, expect, it } from "bun:test";

import type {
  CellStyle,
  SnapshotCell,
  WorkbookSnapshot,
  XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import { BASE_STYLES_BODY, rawXlsx, stylesXml, worksheet } from "./raw-opc.js";

const FIXED_ZIP_TIME = new Date(1980, 0, 1);
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

/**
 * Original minimal workbook authored for this test, without Sheetwrite's metadata sidecar,
 * so only the native style mapping can produce the imported styles.
 *
 * Styles: xf0 default (11pt Calibri), xf1 `$#,##0.00`, xf2 `0.00%` in 18pt Georgia aligned top,
 * xf3 General aligned center. Column A mixes xf1 and xf2; column B uses xf1 for two
 * numbers and General (xf0) for a third.
 */
function nativeStyledWorkbook(): Uint8Array {
  const styles = `<?xml version="1.0"?><styleSheet xmlns="${MAIN_NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="$#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><sz val="18"/><name val="Georgia"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="1" fillId="0" borderId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs></styleSheet>`;
  const sheet = `<?xml version="1.0"?><worksheet xmlns="${MAIN_NS}"><sheetData><row r="1"><c r="A1" s="1"><v>5</v></c><c r="B1" s="1"><v>3</v></c></row><row r="2"><c r="A2" s="2"><v>0.25</v></c><c r="B2" s="1"><v>4</v></c></row><row r="3"><c r="A3" s="3"><v>7</v></c><c r="B3"><v>9</v></c></row></sheetData></worksheet>`;
  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      ),
      "_rels/.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
      "xl/workbook.xml": strToU8(
        `<?xml version="1.0"?><workbook xmlns="${MAIN_NS}" xmlns:r="${OFFICE_REL_NS}"><sheets><sheet name="Prices" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${OFFICE_REL_NS}/styles" Target="styles.xml"/></Relationships>`,
      ),
      "xl/styles.xml": strToU8(styles),
      "xl/worksheets/sheet1.xml": strToU8(sheet),
    },
    { level: 6, mtime: FIXED_ZIP_TIME },
  );
}

function cellStyle(snapshot: WorkbookSnapshot, row: number, col: number): CellStyle | undefined {
  const cells: SnapshotCell[] = snapshot.sheets[0]!.cells.flatMap((block) =>
    block.cells.filter(
      (cell) => block.startRow + cell.rowOffset === row && block.startCol + cell.colOffset === col,
    ),
  );
  return cells[0]?.style;
}

describe("XLSX cell font family, vertical alignment, and number formats", () => {
  it("imports native styles per cell, keeping mixed column formats and the default font out", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(nativeStyledWorkbook(), {
      onWarning: (warning) => warnings.push(warning),
    });
    const sheet = imported.sheets[0]!;

    // Column A mixes two formats: no column default, each cell keeps its own.
    expect(sheet.columns[0]!.numberFormat).toBeUndefined();
    expect(cellStyle(imported, 0, 0)).toEqual({
      numberFormat: "$#,##0.00",
      verticalAlign: "bottom",
    });
    expect(cellStyle(imported, 1, 0)).toEqual({
      numberFormat: "0.00%",
      fontFamily: "Georgia",
      fontSize: 24,
      verticalAlign: "top",
    });
    // Center needs an explicit override over the native bottom column default.
    expect(cellStyle(imported, 2, 0)).toEqual({ verticalAlign: "middle" });

    // Column B agrees on one format; its General number opts out explicitly.
    expect(sheet.columns[1]!.numberFormat).toBe("$#,##0.00");
    expect(cellStyle(imported, 0, 1)).toEqual({ verticalAlign: "bottom" });
    expect(cellStyle(imported, 2, 1)).toEqual({ numberFormat: "General", verticalAlign: "bottom" });

    expect(warnings.filter((warning) => warning.code === "format-loss")).toEqual([]);
  });

  it("exports font family, vertical alignment, and per-cell number formats natively", async () => {
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(nativeStyledWorkbook());
    const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(imported));
    const styles = strFromU8(parts["xl/styles.xml"]!);

    expect(styles).toContain('<name val="Georgia"/>');
    expect(styles).toContain('<sz val="18"/>');
    expect(styles).toContain('vertical="top"');
    expect(styles).toContain('vertical="center"');
    expect(styles).toContain('formatCode="$#,##0.00"');
    expect(styles).toContain('numFmtId="10"');
    // LibreOffice uses Normal for unstyled cells, independently of cellXfs0.
    const normalStyle = styles.match(/<cellStyleXfs\b[^>]*>([\s\S]*?)<\/cellStyleXfs>/)?.[1];
    expect(normalStyle).toContain('applyAlignment="1"');
    expect(normalStyle).toContain('vertical="center"');
  });

  it.each([
    ["absent alignment", "", "bottom", undefined],
    ["absent vertical", '<alignment horizontal="right"/>', "bottom", undefined],
    ["bottom", '<alignment vertical="bottom"/>', "bottom", "bottom"],
    ["center", '<alignment vertical="center"/>', undefined, "middle"],
    ["top", '<alignment vertical="top"/>', "top", "top"],
  ] as const)(
    "maps native %s for cellXfs0, column defaults, and differential styles",
    async (_name, alignment, verticalAlign, differentialVertical) => {
      const bytes = rawXlsx({
        styles: stylesXml(
          BASE_STYLES_BODY.replace(
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>',
            `<xf numFmtId="0" fontId="0" fillId="0" borderId="0">${alignment}</xf>`,
          ) + `<dxfs count="1"><dxf><font><b/></font>${alignment}</dxf></dxfs>`,
        ),
        sheets: [
          {
            xml: worksheet(
              '<cols><col min="2" max="2" style="0"/></cols><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c></row></sheetData><conditionalFormatting sqref="A1"><cfRule type="expression" priority="1" dxfId="0"><formula>A1&gt;0</formula></cfRule></conditionalFormatting>',
            ),
          },
        ],
      });
      const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
      const sheet = imported.sheets[0];
      if (!sheet) throw new Error("Expected imported sheet");
      expect(cellStyle(imported, 0, 0)?.verticalAlign).toBe(verticalAlign);
      expect(cellStyle(imported, 0, 1)?.verticalAlign).toBe(verticalAlign);
      expect(sheet.columns[1]?.cellStyle?.verticalAlign).toBe(verticalAlign);
      expect(sheet.conditionalFormats?.[0]?.style.verticalAlign).toBe(differentialVertical);
      expect(sheet.conditionalFormats?.[0]?.style.bold).toBe(true);
    },
  );

  it("keeps centered cells centered over bottom column defaults, including implicit XF0", async () => {
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        styles: stylesXml(
          BASE_STYLES_BODY.replace(
            '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs>',
            '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0"><alignment vertical="center"/></xf></cellXfs>',
          ),
        ),
        sheets: [
          {
            xml: worksheet(
              '<cols><col min="2" max="2" style="0"/><col min="3" max="3" style="1"/><col min="4" max="4" width="12"/></cols><sheetData><row r="1"><c r="A1" s="1"><v>1</v></c><c r="B1" s="1"><v>2</v></c><c r="C1" s="1"><v>3</v></c></row></sheetData>',
            ),
          },
        ],
      }),
    );
    expect(imported.sheets[0]?.columns.map((column) => column.cellStyle?.verticalAlign)).toEqual([
      "bottom",
      "bottom",
      undefined,
      "bottom",
    ]);
    expect([0, 1, 2].map((col) => cellStyle(imported, 0, col)?.verticalAlign)).toEqual([
      "middle",
      "middle",
      undefined,
    ]);
  });

  it.each([
    ["unset", undefined, "center"],
    ["bottom", "bottom", undefined],
    ["top", "top", "top"],
    ["middle", "middle", "center"],
  ] as const)(
    "exports %s alignment as native bytes without changing differential absence",
    async (_name, verticalAlign, nativeVertical) => {
      const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(nativeStyledWorkbook());
      const style: CellStyle = { bold: true, ...(verticalAlign ? { verticalAlign } : {}) };
      const source: WorkbookSnapshot = {
        ...imported,
        sheets: imported.sheets.map((sheet) => ({
          ...sheet,
          columns: [{ key: "a", header: "A", width: 100, type: "number", cellStyle: style }],
          cells: [
            {
              startRow: 0,
              startCol: 0,
              rowCount: 1,
              colCount: 1,
              cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 1 }, style }],
            },
          ],
          conditionalFormats: [
            {
              range: { sheet: sheet.id, start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
              when: { kind: "formula", source: "=A1>0" },
              style: { bold: true },
            },
          ],
        })),
      };
      const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(source));
      const stylesPart = parts["xl/styles.xml"];
      const sheetPart = parts["xl/worksheets/sheet1.xml"];
      if (!stylesPart || !sheetPart) throw new Error("Expected native workbook parts");
      const styles = strFromU8(stylesPart);
      const xfs = styles
        .match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1]
        ?.match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g);
      const cellStyleId = Number(
        strFromU8(sheetPart).match(/<c\b[^>]*\br="A1"[^>]*\bs="(\d+)"/)?.[1] ?? 0,
      );
      expect(xfs?.[0]).toContain('vertical="center"');
      expect(xfs?.[cellStyleId]?.match(/\bvertical="([^"]+)"/)?.[1]).toBe(nativeVertical);
      expect(styles.match(/<dxfs\b[^>]*>([\s\S]*?)<\/dxfs>/)?.[1]).not.toContain("<alignment");
    },
  );
});
