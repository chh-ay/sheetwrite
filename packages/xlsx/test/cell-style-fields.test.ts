import { describe, expect, it } from "bun:test";

import type { CellStyle } from "@sheetwrite/core";

import { sheetwriteWorkbookBackend as backend } from "../src/workbook.js";
import { BASE_STYLES_BODY, rawXlsx, stylesXml, worksheet } from "./raw-opc.js";
import {
  block,
  book,
  collectWarnings,
  partText,
  range,
  sheet,
  sheetAt,
  styleAt,
} from "./workbook-fixtures.js";

/**
 * A workbook without Sheetwrite's metadata sidecar, so only the native style mapping can
 * produce the imported styles. Styles: xf0 default (11pt Calibri), xf1 `$#,##0.00`, xf2
 * `0.00%` in 18pt Georgia aligned top, xf3 General aligned center. Column A mixes xf1 and
 * xf2; column B uses xf1 for two numbers and General (xf0) for a third.
 */
const nativeStyledWorkbook = () =>
  rawXlsx({
    styles: stylesXml(
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="$#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><sz val="18"/><name val="Georgia"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="1" fillId="0" borderId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs>',
    ),
    sheets: [
      {
        name: "Prices",
        xml: worksheet(
          '<sheetData><row r="1"><c r="A1" s="1"><v>5</v></c><c r="B1" s="1"><v>3</v></c></row><row r="2"><c r="A2" s="2"><v>0.25</v></c><c r="B2" s="1"><v>4</v></c></row><row r="3"><c r="A3" s="3"><v>7</v></c><c r="B3"><v>9</v></c></row></sheetData>',
        ),
      },
    ],
  });

describe("XLSX cell font family, vertical alignment, and number formats", () => {
  it("imports native styles per cell, keeping mixed column formats and the default font out", async () => {
    const { warnings, onWarning } = collectWarnings();
    const imported = await backend.fromXlsxWorkbook(nativeStyledWorkbook(), { onWarning });
    const prices = sheetAt(imported);

    // Column A mixes two formats: no column default, each cell keeps its own.
    expect(prices.columns[0]?.numberFormat).toBeUndefined();
    expect(styleAt(imported, 0, 0)).toEqual({ numberFormat: "$#,##0.00", verticalAlign: "bottom" });
    expect(styleAt(imported, 1, 0)).toEqual({
      numberFormat: "0.00%",
      fontFamily: "Georgia",
      fontSize: 24,
      verticalAlign: "top",
    });
    // Center needs an explicit override over the native bottom column default.
    expect(styleAt(imported, 2, 0)).toEqual({ verticalAlign: "middle" });
    // Column B agrees on one format; its General number opts out explicitly.
    expect(prices.columns[1]?.numberFormat).toBe("$#,##0.00");
    expect(styleAt(imported, 0, 1)).toEqual({ verticalAlign: "bottom" });
    expect(styleAt(imported, 2, 1)).toEqual({ numberFormat: "General", verticalAlign: "bottom" });
    expect(warnings.filter((warning) => warning.code === "format-loss")).toEqual([]);
  });

  it("exports font family, vertical alignment, and per-cell number formats natively", async () => {
    const imported = await backend.fromXlsxWorkbook(nativeStyledWorkbook());
    const styles = partText(await backend.toXlsxWorkbook(imported), "xl/styles.xml");
    for (const fragment of [
      '<name val="Georgia"/>',
      '<sz val="18"/>',
      'vertical="top"',
      'vertical="center"',
      'formatCode="$#,##0.00"',
      'numFmtId="10"',
    ]) {
      expect(styles).toContain(fragment);
    }
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

  it("keeps centered cells centered over bottom column defaults, including implicit XF0", async () => {
    const imported = await backend.fromXlsxWorkbook(
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
    expect(sheetAt(imported).columns.map((column) => column.cellStyle?.verticalAlign)).toEqual([
      "bottom",
      "bottom",
      undefined,
      "bottom",
    ]);
    expect([0, 1, 2].map((col) => styleAt(imported, 0, col)?.verticalAlign)).toEqual([
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
      expect(xfs?.[0]).toContain('vertical="center"');
      expect(xfs?.[cellStyleId]?.match(/\bvertical="([^"]+)"/)?.[1]).toBe(nativeVertical);
      expect(styles.match(/<dxfs\b[^>]*>([\s\S]*?)<\/dxfs>/)?.[1]).not.toContain("<alignment");
    },
  );
});
