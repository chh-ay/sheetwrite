import { describe, expect, it } from "bun:test";

import type { WorkbookSnapshot, XlsxWorkbookWarning } from "@sheetwrite/core";
import { strFromU8, unzipSync } from "fflate";

import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import {
  BASE_STYLES_BODY,
  rawXlsx,
  stylesXml,
  TRANSITIONAL_MAIN,
  TRANSITIONAL_REL,
  worksheet,
} from "./raw-opc.js";

const TABLE_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml";

function native_table_package(
  table_xml: string,
  workbook_extra = "",
  options: { styles?: string; worksheetExtra?: string } = {},
): Uint8Array {
  return rawXlsx({
    sheets: [
      {
        name: "Raw",
        xml: worksheet(
          `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Amount</t></is></c></row></sheetData>${options.worksheetExtra ?? ""}<tableParts count="1"><tablePart r:id="rId1"/></tableParts>`,
        ),
        relationships: `<Relationship Id="rId1" Type="${TRANSITIONAL_REL}/table" Target="../tables/table1.xml"/>`,
      },
    ],
    workbookExtra: workbook_extra,
    styles: options.styles,
    extraOverrides: [`<Override PartName="/xl/tables/table1.xml" ContentType="${TABLE_CONTENT}"/>`],
    extraFiles: { "xl/tables/table1.xml": table_xml },
  });
}

function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "sheet-stable" },
    sheets: [
      {
        id: "sheet-stable",
        name: "Data",
        order: 0,
        rowCount: 4,
        columns: [{ key: "amount", header: "Amount", width: 80, type: "number" }],
        tables: [
          {
            id: "table-stable",
            name: "Sales",
            range: {
              sheet: "sheet-stable",
              start: { row: 0, col: 0 },
              end: { row: 3, col: 0 },
            },
            columns: [{ id: "column-stable", name: "Amount", totalsRowLabel: "Total" }],
            headerRow: true,
            totalsRow: true,
            style: { name: "TableStyleMedium2", showRowStripes: true },
          },
        ],
        cells: [],
      },
    ],
  };
}

function part_text(parts: Record<string, Uint8Array>, name: string): string {
  const bytes = parts[name];
  if (!bytes) throw new Error(`Missing exported XLSX part ${name}`);
  return strFromU8(bytes);
}

function rule_table(rules: string, column_rules = "", column_attributes = ""): string {
  return `<table xmlns="${TRANSITIONAL_MAIN}" id="1" displayName="Sales" ref="A1:A4" totalsRowCount="1">${rules}<tableColumns count="1"><tableColumn id="1" name="Amount"${column_attributes}>${column_rules}</tableColumn></tableColumns></table>`;
}

describe("native XLSX workbook tables", () => {
  it("round-trips Sheetwrite stable identities through native table parts and sidecar metadata", async () => {
    const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot());
    const parts = unzipSync(bytes);
    const table_xml = strFromU8(parts["xl/tables/table1.xml"]!);
    const sheet_xml = strFromU8(parts["xl/worksheets/sheet1.xml"]!);

    expect(sheet_xml).toContain('<tableParts count="1"><tablePart r:id="rId3"/></tableParts>');
    expect(table_xml).toContain('displayName="Sales"');
    expect(table_xml).toContain('ref="A1:A4"');
    expect(table_xml).toContain('totalsRowLabel="Total"');
    expect(table_xml).toContain('name="TableStyleMedium2"');

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    expect(imported.sheets[0]!.tables).toEqual(snapshot().sheets[0]!.tables);
  });

  it.each([
    [
      "values and grouped dates",
      '<filters blank="1" calendarType="gregorian"><filter val="A&amp;B"/><dateGroupItem year="2026" month="10" day="25" dateTimeGrouping="day"/></filters>',
    ],
    [
      "custom comparisons",
      '<customFilters and="1"><customFilter operator="greaterThanOrEqual" val="10"/><customFilter operator="lessThan" val="20"/></customFilters>',
    ],
    ["top percentages", '<top10 top="0" percent="1" val="25" filterVal="12.5"/>'],
    [
      "dynamic dates",
      '<dynamicFilter type="thisMonth" val="46296" maxVal="46327" valIso="2026-10-01T00:00:00Z" maxValIso="2026-11-01T00:00:00Z"/>',
    ],
    ["icons", '<iconFilter iconSet="3Arrows" iconId="1"/>'],
  ])(
    "round-trips native table autofilter %s without relying on the sidecar",
    async (_name, criteria) => {
      const warnings: XlsxWorkbookWarning[] = [];
      const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
        native_table_package(
          rule_table(
            `<autoFilter ref="A1:A3"><filterColumn colId="0" hiddenButton="1" showButton="0">${criteria}</filterColumn></autoFilter>`,
          ),
        ),
        { onWarning: (warning) => warnings.push(warning) },
      );
      const table = imported.sheets[0]?.tables?.[0];
      expect(table?.autoFilter).toMatchObject({
        name: "autoFilter",
        attributes: { ref: "A1:A3" },
        children: [
          { name: "filterColumn", attributes: { colId: "0", hiddenButton: "1", showButton: "0" } },
        ],
      });
      expect(table?.unsupportedFeatures).toBeUndefined();
      const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(imported));
      const saved = part_text(parts, "xl/tables/table1.xml");
      const native = await sheetwriteWorkbookBackend.fromXlsxWorkbook(native_table_package(saved));
      expect(native.sheets[0]?.tables?.[0]?.autoFilter).toEqual(table?.autoFilter);
      expect(warnings.filter((warning) => warning.code === "unsupported-feature")).toEqual([]);
    },
  );

  it("keeps Excel autofilters that carry revision uid attributes", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      native_table_package(
        rule_table(
          '<autoFilter xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/revision" ref="A1:A3" xr:uid="{00000000-0001-0000-0000-000000000000}"><filterColumn colId="0"><filters><filter val="1"/></filters></filterColumn></autoFilter>',
        ),
      ),
      { onWarning: (warning) => warnings.push(warning) },
    );
    expect(imported.sheets[0]?.tables?.[0]?.autoFilter?.attributes).toEqual({ ref: "A1:A3" });
    expect(warnings.filter((warning) => warning.code === "unsupported-feature")).toEqual([]);
  });

  it("re-anchors filter and sort refs to a table range moved by structure edits", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      native_table_package(
        rule_table(
          '<autoFilter ref="A1:A3"><filterColumn colId="0"><filters><filter val="1"/></filters></filterColumn></autoFilter><sortState ref="A2:A3"><sortCondition ref="A2:A3"/></sortState>',
        ),
      ),
    );
    const sheet = imported.sheets[0];
    const table = sheet?.tables?.[0];
    if (!sheet || !table) throw new Error("fixture table was not imported");
    // A store row insert above the table moves only `range`, like rebaseSheetRows.
    sheet.rowCount = Math.max(sheet.rowCount, 7);
    table.range = { ...table.range, start: { row: 2, col: 0 }, end: { row: 6, col: 0 } };
    const parts = unzipSync(
      await sheetwriteWorkbookBackend.toXlsxWorkbook(imported, {
        onWarning: (warning) => warnings.push(warning),
      }),
    );
    const saved = part_text(parts, "xl/tables/table1.xml");
    expect(saved).toContain('ref="A3:A7"');
    expect(saved).toContain('<autoFilter ref="A3:A6">');
    expect(saved).toContain('<sortState ref="A4:A6">');
    expect(saved).toContain('<sortCondition ref="A4:A6">');
    expect(warnings.filter((warning) => warning.code === "unsupported-feature")).toEqual([]);
  });

  it("does not emit a sort condition whose column left the table", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      native_table_package(
        rule_table('<sortState ref="A2:A3"><sortCondition ref="A2:A3"/></sortState>'),
      ),
    );
    const sort_state = imported.sheets[0]?.tables?.[0]?.sortState;
    const condition = sort_state?.children[0];
    if (!condition) throw new Error("fixture sort condition was not imported");
    condition.attributes.ref = "C2:C3";
    const parts = unzipSync(
      await sheetwriteWorkbookBackend.toXlsxWorkbook(imported, {
        onWarning: (warning) => warnings.push(warning),
      }),
    );
    expect(part_text(parts, "xl/tables/table1.xml")).not.toContain("sortState");
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "unsupported-feature", sheet: "Raw" }),
    );
  });

  it.each([false, true])("round-trips table sort state nested in autofilter=%s", async (nested) => {
    const sort =
      '<sortState ref="A2:A3" caseSensitive="1" columnSort="0" sortMethod="stroke"><sortCondition ref="A2:A3" descending="1" sortBy="value" customList="Low,Medium,High"/></sortState>';
    const rules = nested ? `<autoFilter ref="A1:A3">${sort}</autoFilter>` : sort;
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      native_table_package(rule_table(rules)),
    );
    const table = imported.sheets[0]?.tables?.[0];
    const sort_state = nested ? table?.autoFilter?.children[0] : table?.sortState;
    expect(sort_state).toMatchObject({
      name: "sortState",
      attributes: { ref: "A2:A3", caseSensitive: "1", columnSort: "0", sortMethod: "stroke" },
      children: [
        { name: "sortCondition", attributes: { customList: "Low,Medium,High", descending: "1" } },
      ],
    });
    const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(imported));
    const native = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      native_table_package(part_text(parts, "xl/tables/table1.xml")),
    );
    expect(native.sheets[0]?.tables?.[0]).toEqual(table);
  });

  it("round-trips calculated-column and custom totals formulas including array rules", async () => {
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      native_table_package(
        rule_table(
          "",
          '<calculatedColumnFormula array="1">IF([@Amount]&gt;0,[@Amount]*2,0)</calculatedColumnFormula><totalsRowFormula array="0">SUBTOTAL(109,[Amount])</totalsRowFormula>',
          ' totalsRowFunction="custom"',
        ),
      ),
    );
    const column = imported.sheets[0]?.tables?.[0]?.columns[0];
    expect(column).toMatchObject({
      totalsRowFunction: "custom",
      calculatedColumnFormula: {
        name: "calculatedColumnFormula",
        attributes: { array: "1" },
        text: "IF([@Amount]>0,[@Amount]*2,0)",
      },
      totalsRowFormula: {
        name: "totalsRowFormula",
        attributes: { array: "0" },
        text: "SUBTOTAL(109,[Amount])",
      },
    });
    const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(imported));
    const native = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      native_table_package(part_text(parts, "xl/tables/table1.xml")),
    );
    expect(native.sheets[0]?.tables?.[0]?.columns[0]).toEqual(column);
  });

  it.each(["none", "sum", "min", "max", "average", "count", "countNums", "stdDev", "var"])(
    "round-trips native totals-row aggregate %s",
    async (aggregate) => {
      const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
        native_table_package(rule_table("", "", ` totalsRowFunction="${aggregate}"`)),
      );
      expect(imported.sheets[0]?.tables?.[0]?.columns[0]?.totalsRowFunction).toBe(aggregate);
      const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(imported));
      expect(part_text(parts, "xl/tables/table1.xml")).toContain(
        `totalsRowFunction="${aggregate}"`,
      );
    },
  );

  it("remaps color filter and sort differential styles after worksheet rules register first", async () => {
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      native_table_package(
        rule_table(
          '<autoFilter ref="A1:A3"><filterColumn colId="0"><colorFilter dxfId="0" cellColor="1"/></filterColumn></autoFilter><sortState ref="A2:A3"><sortCondition ref="A2:A3" sortBy="cellColor" dxfId="0"/></sortState>',
        ),
        "",
        {
          styles: stylesXml(
            `${BASE_STYLES_BODY}<dxfs count="2"><dxf><fill><patternFill><bgColor rgb="FFFF0000"/></patternFill></fill></dxf><dxf><font><color rgb="FF008000"/></font></dxf></dxfs>`,
          ),
          worksheetExtra:
            '<conditionalFormatting sqref="A2:A3"><cfRule type="expression" dxfId="1" priority="1"><formula>TRUE()</formula></cfRule></conditionalFormatting>',
        },
      ),
    );
    const table = imported.sheets[0]?.tables?.[0];
    expect(table?.autoFilter?.children[0]?.children[0]?.differentialStyle).toEqual({
      backgroundColor: "#FF0000",
    });
    const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(imported));
    const saved = part_text(parts, "xl/tables/table1.xml");
    expect(saved.match(/dxfId="1"/g)).toHaveLength(2);
    expect(part_text(parts, "xl/worksheets/sheet1.xml")).toContain('dxfId="0"');
    const native = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      native_table_package(saved, "", { styles: part_text(parts, "xl/styles.xml") }),
    );
    expect(native.sheets[0]?.tables?.[0]?.autoFilter).toEqual(table?.autoFilter);
    expect(native.sheets[0]?.tables?.[0]?.sortState).toEqual(table?.sortState);
  });

  it("does not reactivate external-data formulas stored as calculated or totals rules", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      native_table_package(
        rule_table(
          "",
          "<calculatedColumnFormula>'[private.xlsx]Sheet1'!A1</calculatedColumnFormula><totalsRowFormula>WEBSERVICE(&quot;https://example.com&quot;)</totalsRowFormula>",
          ' totalsRowFunction="custom"',
        ),
      ),
      { onWarning: (warning) => warnings.push(warning) },
    );
    const column = imported.sheets[0]?.tables?.[0]?.columns[0];
    expect(column?.calculatedColumnFormula).toBeUndefined();
    expect(column?.totalsRowFormula).toBeUndefined();
    expect(column?.totalsRowFunction).toBeUndefined();
    expect(warnings.filter((warning) => warning.message.includes("was dropped"))).toHaveLength(2);
    const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(imported));
    const saved = part_text(parts, "xl/tables/table1.xml");
    expect(saved).not.toContain("private.xlsx");
    expect(saved).not.toContain("WEBSERVICE");
  });

  it("keeps formulas whose table columns have numeric or file-like names", async () => {
    const header = (ref: string, text: string) =>
      `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
    const sheet_xml = worksheet(
      "<sheetData>" +
        `<row r="1">${header("A1", "2023")}${header("B1", "report.xlsx")}<c r="C1"><f>SUM(Sales[2023])</f></c><c r="D1"><f>[1]Data!A1</f></c></row>` +
        '<row r="2"><c r="A2"><v>5</v></c><c r="B2"><v>1</v></c><c r="C2"><f>SUM(Sales[report.xlsx])</f></c><c r="D2"><f>[Budget.xlsx]Data!A1</f></c></row>' +
        '<row r="3"><c r="A3"><v>7</v></c><c r="B3"><v>2</v></c><c r="C3"><f>Sales[[#Headers],[2023]]</f></c><c r="D3"><f>\'C:\\Books\\[Budget.xlsx]Data\'!A1</f></c></row>' +
        '</sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts>',
    );
    const table_xml = `<table xmlns="${TRANSITIONAL_MAIN}" id="1" displayName="Sales" ref="A1:B3"><tableColumns count="2"><tableColumn id="1" name="2023"/><tableColumn id="2" name="report.xlsx"><calculatedColumnFormula>Sales[[#This Row],[2023]]+1</calculatedColumnFormula></tableColumn></tableColumns></table>`;
    const bytes = rawXlsx({
      sheets: [
        {
          name: "Raw",
          xml: sheet_xml,
          relationships: `<Relationship Id="rId1" Type="${TRANSITIONAL_REL}/table" Target="../tables/table1.xml"/>`,
        },
      ],
      extraOverrides: [
        `<Override PartName="/xl/tables/table1.xml" ContentType="${TABLE_CONTENT}"/>`,
      ],
      extraFiles: { "xl/tables/table1.xml": table_xml },
    });

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    const values = new Map(
      (imported.sheets[0]?.cells[0]?.cells ?? []).map((cell) => [
        `${cell.rowOffset},${cell.colOffset}`,
        cell.value,
      ]),
    );
    expect(values.get("0,2")).toEqual({ kind: "formula", src: "=SUM(Sales[2023])" });
    expect(values.get("1,2")).toEqual({ kind: "formula", src: "=SUM(Sales[report.xlsx])" });
    expect(values.get("2,2")).toEqual({ kind: "formula", src: "=Sales[[#Headers],[2023]]" });
    expect(values.get("0,3")).toEqual({ kind: "literal", value: "=[1]Data!A1" });
    expect(values.get("1,3")).toEqual({ kind: "literal", value: "=[Budget.xlsx]Data!A1" });
    expect(values.get("2,3")).toEqual({
      kind: "literal",
      value: "='C:\\Books\\[Budget.xlsx]Data'!A1",
    });
    expect(imported.sheets[0]?.tables?.[0]?.columns[1]?.calculatedColumnFormula?.text).toBe(
      "Sales[[#This Row],[2023]]+1",
    );

    const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(imported));
    const saved = part_text(parts, "xl/worksheets/sheet1.xml");
    expect(saved).toContain("<f>SUM(Sales[2023])</f>");
    expect(saved).toContain("<f>SUM(Sales[report.xlsx])</f>");
    expect(saved).toContain("<f>Sales[[#Headers],[2023]]</f>");
    expect(part_text(parts, "xl/tables/table1.xml")).toContain(
      "<calculatedColumnFormula>Sales[[#This Row],[2023]]+1</calculatedColumnFormula>",
    );
  });

  it("drops a native table that collides with a defined name and emits an exact ambiguity warning", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const bytes = native_table_package(
      `<?xml version="1.0"?><table xmlns="${TRANSITIONAL_MAIN}" id="1" displayName="sales" ref="A1:A2"><tableColumns count="1"><tableColumn id="1" name="Amount"/></tableColumns></table>`,
      '<definedNames><definedName name="Sales">Raw!$A$1</definedName></definedNames>',
    );
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes, {
      onWarning: (warning) => warnings.push(warning),
    });

    expect(imported.sheets[0]!.tables).toBeUndefined();
    expect(imported.workbook.namedRanges?.[0]?.name).toBe("Sales");
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "invalid-metadata", sheet: "Raw" }),
    );
  });
});
