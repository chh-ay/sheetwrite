import { describe, expect, it } from "bun:test";

import type { CellStyle } from "@sheetwrite/core";

import { sheetwriteWorkbookBackend as backend } from "../src/workbook.js";
import { BASE_STYLES_BODY, rawXlsx, stylesXml, worksheet } from "./raw-opc.js";
import { block, book, partText, range, sheet, sheetAt, styleAt } from "./workbook-fixtures.js";

describe("XLSX vertical alignment", () => {
  it.each([
    ["absent alignment", "", "bottom", undefined],
    ["absent vertical", '<alignment horizontal="right"/>', "bottom", undefined],
    ["bottom", '<alignment vertical="bottom"/>', "bottom", "bottom"],
    ["center", '<alignment vertical="center"/>', undefined, "middle"],
    ["top", '<alignment vertical="top"/>', "top", "top"],
  ] as const)(
    "maps native %s for cellXfs0, column defaults, and differential styles",
    async (_name, alignment, verticalAlign, differentialVertical) => {
      const imported = await backend.fromXlsxWorkbook(
        rawXlsx({
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
        }),
      );
      const importedSheet = sheetAt(imported);
      expect(styleAt(imported, 0, 0)?.verticalAlign).toBe(verticalAlign);
      expect(styleAt(imported, 0, 1)?.verticalAlign).toBe(verticalAlign);
      expect(importedSheet.columns[1]?.cellStyle?.verticalAlign).toBe(verticalAlign);
      expect(importedSheet.conditionalFormats?.[0]?.style).toMatchObject({ bold: true });
      expect(importedSheet.conditionalFormats?.[0]?.style.verticalAlign).toBe(differentialVertical);
    },
  );

  it.each([
    ["unset", undefined, "center"],
    ["bottom", "bottom", undefined],
    ["top", "top", "top"],
    ["middle", "middle", "center"],
  ] as const)(
    "exports %s alignment as native bytes without changing differential absence",
    async (_name, verticalAlign, nativeVertical) => {
      const style: CellStyle = { bold: true, ...(verticalAlign ? { verticalAlign } : {}) };
      const cells = block([[1]]);
      const [cell] = cells.cells;
      if (cell) cell.style = style;
      const bytes = await backend.toXlsxWorkbook(
        book([
          sheet("s", "Prices", [], {
            columns: [{ key: "a", header: "A", width: 100, type: "number", cellStyle: style }],
            cells: [cells],
            conditionalFormats: [
              {
                range: range("s", 0, 0),
                when: { kind: "formula", source: "=A1>0" },
                style: { bold: true },
              },
            ],
          }),
        ]),
      );
      const styles = partText(bytes, "xl/styles.xml");
      const xfs = styles
        .match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1]
        ?.match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g);
      const cellStyleId = Number(
        partText(bytes, "xl/worksheets/sheet1.xml").match(
          /<c\b[^>]*\br="A1"[^>]*\bs="(\d+)"/,
        )?.[1] ?? 0,
      );
      // LibreOffice uses Normal for unstyled cells, so cellXfs0 carries Sheetwrite's centered default.
      expect(xfs?.[0]).toContain('vertical="center"');
      expect(xfs?.[cellStyleId]?.match(/\bvertical="([^"]+)"/)?.[1]).toBe(nativeVertical);
      expect(styles.match(/<dxfs\b[^>]*>([\s\S]*?)<\/dxfs>/)?.[1]).not.toContain("<alignment");
    },
  );
});
