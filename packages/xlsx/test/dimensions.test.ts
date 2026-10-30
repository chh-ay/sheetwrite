import { describe, expect, it } from "bun:test";

import type { WorkbookSnapshot } from "@sheetwrite/core";
import { strFromU8, unzipSync } from "fflate";

import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import { rawXlsx, worksheet } from "./raw-opc.js";

function dimensionSnapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s" },
    sheets: [
      {
        id: "s",
        name: "Dimensions",
        order: 0,
        rowCount: 1,
        columns: [1, 5, 12, 61, 75, 80, 100, 111.25].map((width, index) => ({
          key: `c${index}`,
          header: `C${index}`,
          width,
          type: "text",
        })),
        cells: [],
      },
    ],
  };
}

function firstSheetXml(bytes: Uint8Array): string {
  const part = unzipSync(bytes)["xl/worksheets/sheet1.xml"];
  if (!part) throw new Error("Missing worksheet part");
  return strFromU8(part);
}

describe("XLSX dimension byte fidelity", () => {
  it("declares the width-metric font on default and custom native cell fonts", async () => {
    const snapshot = dimensionSnapshot();
    const column = snapshot.sheets[0]?.columns[0];
    if (!column) throw new Error("Missing dimension column");
    column.cellStyle = { color: "#123456" };
    const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot));
    const styles = parts["xl/styles.xml"];
    if (!styles) throw new Error("Missing styles part");
    const fontCollection = strFromU8(styles).match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/)?.[1];
    const fonts = [...(fontCollection ?? "").matchAll(/<font>([\s\S]*?)<\/font>/g)];
    expect(fonts).toHaveLength(2);
    for (const font of fonts) {
      expect(font[1]).toContain('<name val="Calibri"/>');
      expect(font[1]).toContain('<sz val="11"/>');
    }
  });

  it("writes padded maximum-digit widths truncated to 1/256 character", async () => {
    const xml = firstSheetXml(await sheetwriteWorkbookBackend.toXlsxWorkbook(dimensionSnapshot()));
    // The codec uses a shared 7px maximum-digit convention. OOXML includes the
    // 5px padding in stored width, rather than adding it after decoding.
    expect([...xml.matchAll(/<col\b[^>]*\bwidth="([^"]+)"/g)].map((match) => match[1])).toEqual([
      "0.140625",
      "0.7109375",
      "1.7109375",
      "8.7109375",
      "10.7109375",
      "11.42578125",
      "14.28515625",
      "15.890625",
    ]);
  });

  it("preserves exact Sheetwrite pixel widths through XLSX bytes including fractional widths", async () => {
    const source = dimensionSnapshot();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      await sheetwriteWorkbookBackend.toXlsxWorkbook(source),
    );
    expect(imported.sheets[0]?.columns.map((column) => column.width)).toEqual(
      source.sheets[0]?.columns.map((column) => column.width),
    );
  });

  it("imports native padded widths without five-pixel growth and converges over byte cycles", async () => {
    let bytes = rawXlsx({
      sheets: [
        {
          xml: worksheet(
            '<dimension ref="A1:D1"/><cols><col min="1" max="1" width="8.7109375" customWidth="1"/><col min="2" max="2" width="10.7109375" customWidth="1"/><col min="3" max="3" width="11.42578125" customWidth="1"/><col min="4" max="4" width="14.28515625" customWidth="1"/></cols><sheetData/>',
          ),
        },
      ],
    });
    for (let cycle = 0; cycle < 3; cycle++) {
      const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
      expect(imported.sheets[0]?.columns.map((column) => column.width)).toEqual([61, 75, 80, 100]);
      bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(imported);
    }
  });

  it("only treats customHeight rows as fixed, retaining hidden automatic rows", async () => {
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1:A5"/><sheetData><row r="1" ht="15"/><row r="2" ht="18" customHeight="0"/><row r="3" ht="21" customHeight="1"/><row r="4" ht="24" hidden="1"/><row r="5" ht="27" customHeight="true"/></sheetData>',
            ),
          },
        ],
      }),
    );
    expect(imported.sheets[0]?.rowMeta).toEqual([
      [2, { height: 28 }],
      [3, { hidden: true }],
      [4, { height: 36 }],
    ]);
    const xml = firstSheetXml(await sheetwriteWorkbookBackend.toXlsxWorkbook(imported));
    expect([...xml.matchAll(/<row\b[^>]*\bht="([^"]+)"/g)].map((match) => match[1])).toEqual([
      "21",
      "27",
    ]);
  });
});
