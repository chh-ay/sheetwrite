import { expect, it } from "bun:test";

import { sheetwriteWorkbookBackend as backend } from "../src/workbook.js";
import { rawXlsx, worksheet } from "./raw-opc.js";
import { book, columns, partText, sheet, sheetAt } from "./workbook-fixtures.js";

const oneSheet = (body: string) => rawXlsx({ sheets: [{ xml: worksheet(body) }] });
const matches = (xml: string, pattern: RegExp) =>
  [...xml.matchAll(pattern)].map((match) => match[1]);

it("writes padded maximum-digit widths in Calibri 11 units and reads exact pixel widths back", async () => {
  const widths = [1, 5, 12, 61, 75, 80, 100, 111.25];
  const cols = columns(widths.length).map((column, index) => ({
    ...column,
    width: widths[index] ?? 0,
    ...(index === 0 ? { cellStyle: { color: "#123456" } } : {}),
  }));
  const bytes = await backend.toXlsxWorkbook(
    book([sheet("s", "Dimensions", [], { columns: cols })]),
  );

  // 7px maximum digit width, with OOXML's 5px padding stored in the width.
  expect(
    matches(partText(bytes, "xl/worksheets/sheet1.xml"), /<col\b[^>]*\bwidth="([^"]+)"/g),
  ).toEqual([
    "0.140625",
    "0.7109375",
    "1.7109375",
    "8.7109375",
    "10.7109375",
    "11.42578125",
    "14.28515625",
    "15.890625",
  ]);
  // Every native font, default and custom, declares the font the widths are measured in.
  const fontCollection = partText(bytes, "xl/styles.xml").match(
    /<fonts\b[^>]*>([\s\S]*?)<\/fonts>/,
  )?.[1];
  const fonts = matches(fontCollection ?? "", /<font>([\s\S]*?)<\/font>/g);
  expect(fonts).toHaveLength(2);
  for (const font of fonts) {
    expect(font).toContain('<name val="Calibri"/>');
    expect(font).toContain('<sz val="11"/>');
  }
  // Fractional pixel widths come back exactly.
  expect(
    sheetAt(await backend.fromXlsxWorkbook(bytes)).columns.map((column) => column.width),
  ).toEqual(widths);
});

it("imports native padded widths without five-pixel growth and converges over byte cycles", async () => {
  const widths = ["8.7109375", "10.7109375", "11.42578125", "14.28515625"];
  let bytes = oneSheet(
    `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData/>`,
  );
  for (let cycle = 0; cycle < 3; cycle++) {
    const imported = await backend.fromXlsxWorkbook(bytes);
    expect(sheetAt(imported).columns.map((column) => column.width)).toEqual([61, 75, 80, 100]);
    bytes = await backend.toXlsxWorkbook(imported);
  }
  expect(
    matches(partText(bytes, "xl/worksheets/sheet1.xml"), /<col\b[^>]*\bwidth="([^"]+)"/g),
  ).toEqual(widths);
});

it("only treats customHeight rows as fixed, retaining hidden automatic rows", async () => {
  const imported = await backend.fromXlsxWorkbook(
    oneSheet(
      '<sheetData><row r="1" ht="15"/><row r="2" ht="18" customHeight="0"/><row r="3" ht="21" customHeight="1"/><row r="4" ht="24" hidden="1"/><row r="5" ht="27" customHeight="true"/></sheetData>',
    ),
  );
  expect(sheetAt(imported).rowMeta).toEqual([
    [2, { height: 28 }],
    [3, { hidden: true }],
    [4, { height: 36 }],
  ]);
  const xml = partText(await backend.toXlsxWorkbook(imported), "xl/worksheets/sheet1.xml");
  expect(matches(xml, /<row\b[^>]*\bht="([^"]+)"/g)).toEqual(["21", "27"]);
});
