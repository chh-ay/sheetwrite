import { expect, it } from "bun:test";

import { sheetwriteWorkbookBackend as backend } from "../src/workbook.js";
import { rawXlsx, worksheet } from "./raw-opc.js";
import { partText, sheetAt } from "./workbook-fixtures.js";

const oneSheet = (body: string) => rawXlsx({ sheets: [{ xml: worksheet(body) }] });

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
  // 7px maximum digit width, with OOXML's 5px padding stored in the width.
  expect(
    [...partText(bytes, "xl/worksheets/sheet1.xml").matchAll(/<col\b[^>]*\bwidth="([^"]+)"/g)].map(
      (match) => match[1],
    ),
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
  expect([...xml.matchAll(/<row\b[^>]*\bht="([^"]+)"/g)].map((match) => match[1])).toEqual([
    "21",
    "27",
  ]);
});
