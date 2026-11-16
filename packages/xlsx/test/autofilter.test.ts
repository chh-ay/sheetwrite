import { beforeAll, describe, expect, it } from "bun:test";

import {
  initSheetwrite,
  SheetwriteStore,
  toXlsxWorkbook,
  type ColumnFilter,
  type WorkbookSnapshot,
} from "@sheetwrite/core";

import { xlsxAddon } from "../src/addon.js";
import { sheetwriteWorkbookBackend as backend } from "../src/workbook.js";
import { rawXlsx, worksheet } from "./raw-opc.js";
import { book, collectWarnings, partText, range, sheet, sheetAt } from "./workbook-fixtures.js";

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

const oneSheet = (body: string) => rawXlsx({ sheets: [{ name: "Raw", xml: worksheet(body) }] });

/** A1:C6: a header row, five orders, and a note row below the range. */
function orders(filters: [number, ColumnFilter][]): WorkbookSnapshot {
  return book([
    sheet(
      "s1",
      "Orders",
      [
        ["Item", "Qty", "Rate"],
        ["apple", 3, 0.125],
        ["Apricot", 12, 0.5],
        ["banana", 7, 0.125],
        ["fig", null, 0.25],
        ["grape", 20, 0.75],
        ["Total", 42, null],
      ],
      {
        columns: [
          { key: "item", header: "A", width: 80, type: "text" },
          { key: "qty", header: "B", width: 80, type: "number" },
          { key: "rate", header: "C", width: 80, type: "number", numberFormat: "0.00%" },
        ],
        autoFilter: { range: range("s1", 0, 0, 5, 2) },
        filters,
      },
    ),
  ]);
}

describe("AutoFilter XLSX interchange", () => {
  it("writes Excel's autoFilter, its _FilterDatabase name and the rows it hides", async () => {
    const store = SheetwriteStore.fromSnapshot(
      orders([
        [0, { kind: "custom", join: "and", conditions: [{ op: "beginsWith", value: "a" }] }],
        [2, { kind: "values", values: [0.125, 0.5] }],
      ]),
    );
    const bytes = await toXlsxWorkbook(store);
    const xml = partText(bytes, "xl/worksheets/sheet1.xml");

    expect(xml).toContain(
      '<autoFilter ref="A1:C6"><filterColumn colId="0"><customFilters><customFilter val="a*"/></customFilters></filterColumn><filterColumn colId="2"><filters><filter val="12.50%"/><filter val="50.00%"/></filters></filterColumn></autoFilter>',
    );
    // Rows 4 to 6 (banana, fig, grape) fail a filter; the header and the total row below the range stay.
    const hidden = [...xml.matchAll(/<row r="(\d+)"[^>]* hidden="1"/g)].map((match) => match[1]);
    expect(hidden).toEqual(["4", "5", "6"]);
    expect(partText(bytes, "xl/workbook.xml")).toContain(
      '<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">&apos;Orders&apos;!$A$1:$C$6</definedName>',
    );
    store.dispose();
  });

  it("round-trips the range and every kind of condition exactly", async () => {
    const filters: [number, ColumnFilter][] = [
      [
        0,
        {
          kind: "custom",
          join: "or",
          conditions: [
            { op: "contains", value: "an" },
            { op: "endsWith", value: "pe" },
          ],
        },
      ],
      [
        1,
        {
          kind: "custom",
          join: "and",
          conditions: [
            { op: "gte", value: 5 },
            { op: "lt", value: 20 },
          ],
        },
      ],
      [2, { kind: "values", values: [0.125, null] }],
    ];
    const imported = sheetAt(
      await backend.fromXlsxWorkbook(await backend.toXlsxWorkbook(orders(filters))),
    );

    expect(imported.autoFilter).toEqual({ range: range("s1", 0, 0, 5, 2) });
    expect(imported.filters).toEqual(filters);
    // Hidden rows stay the filter's, not the sheet's.
    expect(imported.rowMeta ?? []).toEqual([]);
  });

  it("reads an Excel-made autoFilter: value lists by shown text, custom and non-blank conditions", async () => {
    const { warnings, onWarning } = collectWarnings();
    const cells =
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Qty</t></is></c><c r="C1" t="inlineStr"><is><t>When</t></is></c><c r="D1" t="inlineStr"><is><t>Note</t></is></c></row>' +
      '<row r="2"><c r="A2" t="inlineStr"><is><t>Apple</t></is></c><c r="B2"><v>3</v></c><c r="D2" t="inlineStr"><is><t>x</t></is></c></row>' +
      '<row r="3" hidden="1"><c r="A3" t="inlineStr"><is><t>banana</t></is></c><c r="B3"><v>12</v></c></row>' +
      '<row r="4" hidden="1"><c r="A4" t="inlineStr"><is><t>fig</t></is></c><c r="B4"><v>7</v></c></row>' +
      '<row r="6" hidden="1"><c r="A6" t="inlineStr"><is><t>kept hidden</t></is></c></row>';
    const filter =
      '<autoFilter ref="A1:D4">' +
      '<filterColumn colId="0"><filters blank="1"><filter val="apple"/><filter val="kiwi"/></filters></filterColumn>' +
      '<filterColumn colId="1"><customFilters and="1"><customFilter operator="greaterThanOrEqual" val="2"/><customFilter operator="lessThan" val="10"/></customFilters></filterColumn>' +
      '<filterColumn colId="2"><filters><dateGroupItem year="2026" dateTimeGrouping="year"/></filters></filterColumn>' +
      '<filterColumn colId="3"><customFilters><customFilter operator="notEqual" val=" "/></customFilters></filterColumn>' +
      "</autoFilter>";
    const imported = sheetAt(
      await backend.fromXlsxWorkbook(oneSheet(`<sheetData>${cells}</sheetData>${filter}`), {
        onWarning,
      }),
    );

    expect(imported.autoFilter).toEqual({ range: range(imported.id, 0, 0, 3, 3) });
    expect(imported.filters).toEqual([
      // "apple" names the cell that shows "Apple"; "kiwi" names no cell and stays text.
      [0, { kind: "values", values: ["Apple", "kiwi", null] }],
      [
        1,
        {
          kind: "custom",
          join: "and",
          conditions: [
            { op: "gte", value: 2 },
            { op: "lt", value: 10 },
          ],
        },
      ],
      [3, { kind: "nonEmpty" }],
    ]);
    // Rows 3 and 4 were the filter's; row 6 lies below the range and stays hidden.
    expect(imported.rowMeta).toEqual([[5, { hidden: true }]]);
    expect(warnings).toEqual([
      expect.objectContaining({ code: "unsupported-feature", sheet: "Raw" }),
    ]);
  });

  it("keeps one filter per column: a repeated filterColumn is dropped with a warning", async () => {
    const { warnings, onWarning } = collectWarnings();
    const cells = Array.from(
      { length: 4 },
      (_unused, row) => `<row r="${row + 1}"><c r="A${row + 1}"><v>${row}</v></c></row>`,
    ).join("");
    const repeated = Array.from(
      { length: 50 },
      (_unused, index) =>
        `<filterColumn colId="0"><filters><filter val="${index + 1}"/></filters></filterColumn>`,
    ).join("");
    const imported = sheetAt(
      await backend.fromXlsxWorkbook(
        oneSheet(`<sheetData>${cells}</sheetData><autoFilter ref="A1:A4">${repeated}</autoFilter>`),
        { onWarning },
      ),
    );
    expect(imported.filters).toEqual([[0, { kind: "values", values: [1] }]]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((warning) => warning.code === "unsupported-feature")).toBe(true);
  });

  it("drops a custom filter whose operator is not Excel's, not the whole import", async () => {
    const { warnings, onWarning } = collectWarnings();
    const imported = sheetAt(
      await backend.fromXlsxWorkbook(
        oneSheet(
          '<sheetData><row r="1"><c r="A1"><v>1</v></c></row><row r="2"><c r="A2"><v>2</v></c></row></sheetData>' +
            '<autoFilter ref="A1:A2"><filterColumn colId="0"><customFilters><customFilter operator="constructor" val="1"/></customFilters></filterColumn></autoFilter>',
        ),
        { onWarning },
      ),
    );
    expect(imported.autoFilter?.range.end).toEqual({ row: 1, col: 0 });
    expect(imported.filters).toBeUndefined();
    expect(warnings).toEqual([
      expect.objectContaining({ code: "unsupported-feature", sheet: "Raw" }),
    ]);
  });

  it("reads Excel's one-condition custom filter, which has no join, as an and", async () => {
    const imported = sheetAt(
      await backend.fromXlsxWorkbook(
        oneSheet(
          '<dimension ref="A1:C6"/><sheetData/><autoFilter ref="A1:C6"><filterColumn colId="1"><customFilters><customFilter operator="greaterThan" val="5"/></customFilters></filterColumn></autoFilter>',
        ),
      ),
    );
    expect(imported.filters).toEqual([
      [1, { kind: "custom", join: "and", conditions: [{ op: "gt", value: 5 }] }],
    ]);
  });
});
