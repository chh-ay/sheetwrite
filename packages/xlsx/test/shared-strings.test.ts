import { beforeAll, describe, expect, it } from "bun:test";

import { type CellValue, initSheetwrite } from "@sheetwrite/core";

import { sheetwriteWorkbookBackend as backend } from "../src/index.js";
import { book, partText, sheet, valuesOf } from "./workbook-fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const literal = (value: string): CellValue => ({ kind: "literal", value });

describe("XLSX shared strings", () => {
  it("writes each distinct text once in first-use order, and text cells refer to it", async () => {
    const bytes = await backend.toXlsxWorkbook(
      book([sheet("s", "Sheet1", [["North", "South"], ["North"]])]),
    );
    expect(partText(bytes, "xl/worksheets/sheet1.xml")).toMatch(
      /<c r="A1"[^>]*t="s"><v>0<\/v><\/c><c r="B1"[^>]*t="s"><v>1<\/v><\/c>.*<c r="A2"[^>]*t="s"><v>0<\/v><\/c>/u,
    );
    expect(partText(bytes, "xl/sharedStrings.xml")).toContain(
      'count="3" uniqueCount="2"><si><t xml:space="preserve">North</t></si><si><t xml:space="preserve">South</t></si></sst>',
    );
    expect(partText(bytes, "[Content_Types].xml")).toContain(
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
    );
    expect(partText(bytes, "xl/_rels/workbook.xml.rels")).toMatch(
      /Type="http:\/\/schemas.openxmlformats.org\/officeDocument\/2006\/relationships\/sharedStrings" Target="sharedStrings.xml"/u,
    );
  });

  it("reads back texts with edge spaces, escape-like text, control characters and emoji", async () => {
    const texts = [
      "  lead",
      "trail  ",
      " ",
      "_x0001_",
      "a_x005F_b",
      "\u0001\u001f",
      "tab\there\r\nline",
      "😀 é €",
      `<&>"'`,
    ];
    const bytes = await backend.toXlsxWorkbook(
      book([
        sheet(
          "s",
          "Sheet1",
          texts.map((text) => [text]),
        ),
      ]),
    );
    expect(valuesOf(await backend.fromXlsxWorkbook(bytes))).toEqual(texts.map(literal));
  });

  it("writes texts past maxSharedStrings inline, so the file opens under the same limit", async () => {
    const resourceLimits = { maxSharedStrings: 2 };
    const bytes = await backend.toXlsxWorkbook(
      book([sheet("s", "Sheet1", [["a", "b", "c", "a"]])]),
      { resourceLimits },
    );
    expect(partText(bytes, "xl/worksheets/sheet1.xml")).toMatch(
      /<c r="C1"[^>]*t="inlineStr"><is><t xml:space="preserve">c<\/t><\/is><\/c><c r="D1"[^>]*t="s"><v>0<\/v><\/c>/u,
    );
    expect(valuesOf(await backend.fromXlsxWorkbook(bytes, { resourceLimits }))).toEqual(
      ["a", "b", "c", "a"].map(literal),
    );
  });
});
