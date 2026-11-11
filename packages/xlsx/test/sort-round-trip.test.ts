import { beforeAll, describe, expect, it } from "bun:test";

import { initSheetwrite, SheetwriteStore, type WorkbookSnapshot } from "@sheetwrite/core";
import { strFromU8, unzipSync } from "fflate";

import { sheetwriteWorkbookBackend } from "../src/workbook.js";

beforeAll(async () => {
  await initSheetwrite();
});

/** A1:B4 holds a header and three rows: Name/Qty, pear 3, apple 1, fig 2. */
function fruitSnapshot(): WorkbookSnapshot {
  const rows: [string, string | number][] = [
    ["Name", "Qty"],
    ["pear", 3],
    ["apple", 1],
    ["fig", 2],
  ];
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s1" },
    sheets: [
      {
        id: "s1",
        name: "Fruit",
        order: 0,
        rowCount: rows.length,
        columns: [
          { key: "name", header: "A", width: 80, type: "text" },
          { key: "qty", header: "B", width: 80, type: "number" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: rows.length,
            colCount: 2,
            cells: rows.flatMap(([name, qty], row) => [
              { rowOffset: row, colOffset: 0, value: { kind: "literal" as const, value: name } },
              { rowOffset: row, colOffset: 1, value: { kind: "literal" as const, value: qty } },
            ]),
          },
        ],
      },
    ],
  };
}

async function worksheetXml(snapshot: WorkbookSnapshot, part = "xl/worksheets/sheet1.xml") {
  const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot);
  const file = unzipSync(bytes)[part];
  if (!file) throw new Error(`${part} is missing`);
  return { bytes, xml: strFromU8(file) };
}

/** The text cells of a worksheet in the order the file stores them. */
function inlineTexts(xml: string): string[] {
  return [...xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((match) => match[1] ?? "");
}

describe("sort and XLSX round trips", () => {
  it("writes the cells of a view sort in source order with a sortState", async () => {
    const store = SheetwriteStore.fromSnapshot(fruitSnapshot());
    store.setViewSort("s1", [{ col: 0, ascending: true }]);

    const { bytes, xml } = await worksheetXml(store.exportSnapshot());
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);

    expect(inlineTexts(xml)).toEqual(["Name", "Qty", "pear", "apple", "fig"]);
    expect(xml).toContain('<sortState ref="A1:B4"><sortCondition ref="A1:A4"/></sortState>');
    expect(imported.sheets[0]?.sortKeys).toEqual([{ col: 0, ascending: true }]);
    expect(imported.sheets[0]?.sortState).toBeUndefined();
    store.dispose();
  });

  it("records an in-place sort of a table body in the table's sortState", async () => {
    const store = SheetwriteStore.fromSnapshot(fruitSnapshot());
    store.applyTransaction({
      patches: [
        {
          op: "addTable",
          table: {
            id: "t1",
            name: "Fruit",
            range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } },
            columns: [
              { id: "name", name: "Name" },
              { id: "qty", name: "Qty" },
            ],
            headerRow: true,
            totalsRow: false,
          },
        },
      ],
    });
    store.sortRange({ sheet: "s1", start: { row: 1, col: 0 }, end: { row: 3, col: 1 } }, [
      { col: 1, ascending: false },
    ]);

    const { bytes, xml } = await worksheetXml(store.exportSnapshot(), "xl/tables/table1.xml");
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);

    expect(xml).toContain(
      '<sortState ref="A2:B4"><sortCondition ref="B2:B4" descending="1"></sortCondition></sortState>',
    );
    expect(imported.sheets[0]?.tables?.[0]?.sortState?.children[0]?.attributes).toEqual({
      ref: "B2:B4",
      descending: "1",
    });
    store.dispose();
  });

  it("keeps an imported worksheet sortState unapplied and writes it back", async () => {
    const source = fruitSnapshot();
    const firstSheet = source.sheets[0];
    if (!firstSheet) throw new Error("the fixture has no sheet");
    firstSheet.sortState = {
      name: "sortState",
      attributes: { ref: "A2:B4" },
      text: "",
      children: [{ name: "sortCondition", attributes: { ref: "B2:B4" }, text: "", children: [] }],
    };
    const { bytes } = await worksheetXml(source);

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    const { xml } = await worksheetXml(imported);

    expect(imported.sheets[0]?.sortKeys).toBeUndefined();
    expect(imported.sheets[0]?.sortState).toEqual(firstSheet.sortState);
    expect(inlineTexts(xml)).toEqual(["Name", "Qty", "pear", "apple", "fig"]);
    expect(xml).toContain(
      '<sortState ref="A2:B4"><sortCondition ref="B2:B4"></sortCondition></sortState>',
    );
  });
});
