import { describe, expect, it } from "bun:test";

import { sheetwriteWorkbookBackend as backend } from "../src/workbook.js";
import {
  BASE_STYLES_BODY,
  rawXlsx,
  stylesXml,
  TRANSITIONAL_MAIN,
  TRANSITIONAL_REL,
  worksheet,
} from "./raw-opc.js";
import {
  book,
  cellsOf,
  collectWarnings,
  formula,
  partText,
  range,
  sheet,
  sheetAt,
} from "./workbook-fixtures.js";

const TABLE_PART = "xl/tables/table1.xml";

/** Sheet "Raw" with `rows` and one native table part. */
function nativeTablePackage(
  tableXml: string,
  options: { workbookExtra?: string; styles?: string; worksheetExtra?: string; rows?: string } = {},
): Uint8Array {
  return rawXlsx({
    sheets: [
      {
        name: "Raw",
        xml: worksheet(
          `<sheetData>${options.rows ?? '<row r="1"><c r="A1" t="inlineStr"><is><t>Amount</t></is></c></row>'}</sheetData>${options.worksheetExtra ?? ""}<tableParts count="1"><tablePart r:id="rId1"/></tableParts>`,
        ),
        relationships: `<Relationship Id="rId1" Type="${TRANSITIONAL_REL}/table" Target="../tables/table1.xml"/>`,
      },
    ],
    workbookExtra: options.workbookExtra,
    styles: options.styles,
    extraOverrides: [
      `<Override PartName="/${TABLE_PART}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`,
    ],
    extraFiles: { [TABLE_PART]: tableXml },
  });
}

function ruleTable(rules: string, columnRules = "", columnAttributes = ""): string {
  return `<table xmlns="${TRANSITIONAL_MAIN}" id="1" displayName="Sales" ref="A1:A4" totalsRowCount="1">${rules}<tableColumns count="1"><tableColumn id="1" name="Amount"${columnAttributes}>${columnRules}</tableColumn></tableColumns></table>`;
}

const importTable = async (tableXml: string, options?: Parameters<typeof nativeTablePackage>[1]) =>
  sheetAt(await backend.fromXlsxWorkbook(nativeTablePackage(tableXml, options))).tables?.[0];

/** Import `tableXml`, export it, and import the exported table part again on its own. */
async function reimported(tableXml: string) {
  const { warnings, onWarning } = collectWarnings();
  const imported = await backend.fromXlsxWorkbook(nativeTablePackage(tableXml), { onWarning });
  const saved = partText(await backend.toXlsxWorkbook(imported, { onWarning }), TABLE_PART);
  return { table: sheetAt(imported).tables?.[0], saved, again: await importTable(saved), warnings };
}

describe("native XLSX workbook tables", () => {
  it("round-trips Sheetwrite stable identities through native table parts and sidecar metadata", async () => {
    const source = book([
      sheet("sheet-stable", "Data", [], {
        rowCount: 4,
        tables: [
          {
            id: "table-stable",
            name: "Sales",
            range: range("sheet-stable", 0, 0, 3, 0),
            columns: [{ id: "column-stable", name: "Amount", totalsRowLabel: "Total" }],
            headerRow: true,
            totalsRow: true,
            style: { name: "TableStyleMedium2", showRowStripes: true },
          },
        ],
      }),
    ]);
    const bytes = await backend.toXlsxWorkbook(source);
    expect(partText(bytes, "xl/worksheets/sheet1.xml")).toContain(
      '<tableParts count="1"><tablePart r:id="rId3"/></tableParts>',
    );
    const tableXml = partText(bytes, TABLE_PART);
    for (const fragment of [
      'displayName="Sales"',
      'ref="A1:A4"',
      'totalsRowLabel="Total"',
      'name="TableStyleMedium2"',
    ]) {
      expect(tableXml).toContain(fragment);
    }
    expect(sheetAt(await backend.fromXlsxWorkbook(bytes)).tables).toEqual(sheetAt(source).tables);
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
      const { table, again, warnings } = await reimported(
        ruleTable(
          `<autoFilter ref="A1:A3"><filterColumn colId="0" hiddenButton="1" showButton="0">${criteria}</filterColumn></autoFilter>`,
        ),
      );
      expect(table?.autoFilter).toMatchObject({
        name: "autoFilter",
        attributes: { ref: "A1:A3" },
        children: [
          { name: "filterColumn", attributes: { colId: "0", hiddenButton: "1", showButton: "0" } },
        ],
      });
      expect(table?.unsupportedFeatures).toBeUndefined();
      expect(again?.autoFilter).toEqual(table?.autoFilter);
      expect(warnings.filter((warning) => warning.code === "unsupported-feature")).toEqual([]);
    },
  );

  it("re-anchors filter and sort refs to a table range moved by structure edits", async () => {
    const imported = await backend.fromXlsxWorkbook(
      nativeTablePackage(
        ruleTable(
          '<autoFilter ref="A1:A3"><filterColumn colId="0"><filters><filter val="1"/></filters></filterColumn></autoFilter><sortState ref="A2:A3"><sortCondition ref="A2:A3"/></sortState>',
        ),
      ),
    );
    const moved = sheetAt(imported);
    const table = moved.tables?.[0];
    if (!table) throw new Error("fixture table was not imported");
    // A store row insert above the table moves only `range`, like rebaseSheetRows.
    moved.rowCount = Math.max(moved.rowCount, 7);
    table.range = range(table.range.sheet, 2, 0, 6, 0);
    const { warnings, onWarning } = collectWarnings();
    const saved = partText(await backend.toXlsxWorkbook(imported, { onWarning }), TABLE_PART);
    for (const fragment of [
      'ref="A3:A7"',
      '<autoFilter ref="A3:A6">',
      '<sortState ref="A4:A6">',
      '<sortCondition ref="A4:A6">',
    ]) {
      expect(saved).toContain(fragment);
    }
    expect(warnings.filter((warning) => warning.code === "unsupported-feature")).toEqual([]);
  });

  it("does not emit a sort condition whose column left the table", async () => {
    const imported = await backend.fromXlsxWorkbook(
      nativeTablePackage(
        ruleTable('<sortState ref="A2:A3"><sortCondition ref="A2:A3"/></sortState>'),
      ),
    );
    const condition = sheetAt(imported).tables?.[0]?.sortState?.children[0];
    if (!condition) throw new Error("fixture sort condition was not imported");
    condition.attributes.ref = "C2:C3";
    const { warnings, onWarning } = collectWarnings();
    const saved = partText(await backend.toXlsxWorkbook(imported, { onWarning }), TABLE_PART);
    expect(saved).not.toContain("sortState");
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "unsupported-feature", sheet: "Raw" }),
    );
  });

  it.each([false, true])("round-trips table sort state nested in autofilter=%s", async (nested) => {
    const sort =
      '<sortState ref="A2:A3" caseSensitive="1" columnSort="0" sortMethod="stroke"><sortCondition ref="A2:A3" descending="1" sortBy="value" customList="Low,Medium,High"/></sortState>';
    const { table, again } = await reimported(
      ruleTable(nested ? `<autoFilter ref="A1:A3">${sort}</autoFilter>` : sort),
    );
    expect(nested ? table?.autoFilter?.children[0] : table?.sortState).toMatchObject({
      name: "sortState",
      attributes: { ref: "A2:A3", caseSensitive: "1", columnSort: "0", sortMethod: "stroke" },
      children: [
        { name: "sortCondition", attributes: { customList: "Low,Medium,High", descending: "1" } },
      ],
    });
    expect(again).toEqual(table);
  });

  it("round-trips calculated-column and custom totals formulas including array rules", async () => {
    const { table, again } = await reimported(
      ruleTable(
        "",
        '<calculatedColumnFormula array="1">IF([@Amount]&gt;0,[@Amount]*2,0)</calculatedColumnFormula><totalsRowFormula array="0">SUBTOTAL(109,[Amount])</totalsRowFormula>',
        ' totalsRowFunction="custom"',
      ),
    );
    const column = table?.columns[0];
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
    expect(again?.columns[0]).toEqual(column);
  });

  it.each(["none", "sum", "min", "max", "average", "count", "countNums", "stdDev", "var"])(
    "round-trips native totals-row aggregate %s",
    async (aggregate) => {
      const { table, saved } = await reimported(
        ruleTable("", "", ` totalsRowFunction="${aggregate}"`),
      );
      expect(table?.columns[0]?.totalsRowFunction).toBe(aggregate);
      expect(saved).toContain(`totalsRowFunction="${aggregate}"`);
    },
  );

  it("remaps color filter and sort differential styles after worksheet rules register first", async () => {
    const options = {
      styles: stylesXml(
        `${BASE_STYLES_BODY}<dxfs count="2"><dxf><fill><patternFill><bgColor rgb="FFFF0000"/></patternFill></fill></dxf><dxf><font><color rgb="FF008000"/></font></dxf></dxfs>`,
      ),
      worksheetExtra:
        '<conditionalFormatting sqref="A2:A3"><cfRule type="expression" dxfId="1" priority="1"><formula>TRUE()</formula></cfRule></conditionalFormatting>',
    };
    const imported = await backend.fromXlsxWorkbook(
      nativeTablePackage(
        ruleTable(
          '<autoFilter ref="A1:A3"><filterColumn colId="0"><colorFilter dxfId="0" cellColor="1"/></filterColumn></autoFilter><sortState ref="A2:A3"><sortCondition ref="A2:A3" sortBy="cellColor" dxfId="0"/></sortState>',
        ),
        options,
      ),
    );
    const table = sheetAt(imported).tables?.[0];
    expect(table?.autoFilter?.children[0]?.children[0]?.differentialStyle).toEqual({
      backgroundColor: "#FF0000",
    });
    const bytes = await backend.toXlsxWorkbook(imported);
    const saved = partText(bytes, TABLE_PART);
    expect(saved.match(/dxfId="1"/g)).toHaveLength(2);
    expect(partText(bytes, "xl/worksheets/sheet1.xml")).toContain('dxfId="0"');
    const again = await importTable(saved, { styles: partText(bytes, "xl/styles.xml") });
    expect(again?.autoFilter).toEqual(table?.autoFilter);
    expect(again?.sortState).toEqual(table?.sortState);
  });

  it("does not reactivate external-data formulas stored as calculated or totals rules", async () => {
    const { table, saved, warnings } = await reimported(
      ruleTable(
        "",
        "<calculatedColumnFormula>'[private.xlsx]Sheet1'!A1</calculatedColumnFormula><totalsRowFormula>WEBSERVICE(&quot;https://example.com&quot;)</totalsRowFormula>",
        ' totalsRowFunction="custom"',
      ),
    );
    const column = table?.columns[0];
    expect([
      column?.calculatedColumnFormula,
      column?.totalsRowFormula,
      column?.totalsRowFunction,
    ]).toEqual([undefined, undefined, undefined]);
    expect(warnings.filter((warning) => warning.message.includes("was dropped"))).toHaveLength(2);
    expect(saved).not.toContain("private.xlsx");
    expect(saved).not.toContain("WEBSERVICE");
  });

  it("keeps formulas whose table columns have numeric or file-like names", async () => {
    const header = (ref: string, text: string) =>
      `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
    const imported = await backend.fromXlsxWorkbook(
      nativeTablePackage(
        `<table xmlns="${TRANSITIONAL_MAIN}" id="1" displayName="Sales" ref="A1:B3"><tableColumns count="2"><tableColumn id="1" name="2023"/><tableColumn id="2" name="report.xlsx"><calculatedColumnFormula>Sales[[#This Row],[2023]]+1</calculatedColumnFormula></tableColumn></tableColumns></table>`,
        {
          rows:
            `<row r="1">${header("A1", "2023")}${header("B1", "report.xlsx")}<c r="C1"><f>SUM(Sales[2023])</f></c><c r="D1"><f>[1]Data!A1</f></c></row>` +
            '<row r="2"><c r="A2"><v>5</v></c><c r="B2"><v>1</v></c><c r="C2"><f>SUM(Sales[report.xlsx])</f></c><c r="D2"><f>[Budget.xlsx]Data!A1</f></c></row>' +
            '<row r="3"><c r="A3"><v>7</v></c><c r="B3"><v>2</v></c><c r="C3"><f>Sales[[#Headers],[2023]]</f></c><c r="D3"><f>\'C:\\Books\\[Budget.xlsx]Data\'!A1</f></c></row>',
        },
      ),
    );
    const sources = ["=SUM(Sales[2023])", "=SUM(Sales[report.xlsx])", "=Sales[[#Headers],[2023]]"];
    expect(
      cellsOf(imported)
        .filter((cell) => cell.col >= 2)
        .map((cell) => cell.value),
    ).toEqual([
      formula(sources[0] ?? ""),
      { kind: "literal", value: "=[1]Data!A1" },
      formula(sources[1] ?? ""),
      { kind: "literal", value: "=[Budget.xlsx]Data!A1" },
      formula(sources[2] ?? ""),
      { kind: "literal", value: "='C:\\Books\\[Budget.xlsx]Data'!A1" },
    ]);
    const calculated = "Sales[[#This Row],[2023]]+1";
    expect(sheetAt(imported).tables?.[0]?.columns[1]?.calculatedColumnFormula?.text).toBe(
      calculated,
    );

    const bytes = await backend.toXlsxWorkbook(imported);
    const saved = partText(bytes, "xl/worksheets/sheet1.xml");
    for (const source of sources) expect(saved).toContain(`<f>${source.slice(1)}</f>`);
    expect(partText(bytes, TABLE_PART)).toContain(
      `<calculatedColumnFormula>${calculated}</calculatedColumnFormula>`,
    );
  });

  it("drops a native table that collides with a defined name and emits an exact ambiguity warning", async () => {
    const { warnings, onWarning } = collectWarnings();
    const imported = await backend.fromXlsxWorkbook(
      nativeTablePackage(
        `<?xml version="1.0"?><table xmlns="${TRANSITIONAL_MAIN}" id="1" displayName="sales" ref="A1:A2"><tableColumns count="1"><tableColumn id="1" name="Amount"/></tableColumns></table>`,
        {
          workbookExtra:
            '<definedNames><definedName name="Sales">Raw!$A$1</definedName></definedNames>',
        },
      ),
      { onWarning },
    );
    expect(sheetAt(imported).tables).toBeUndefined();
    expect(imported.workbook.namedRanges?.[0]?.name).toBe("Sales");
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "invalid-metadata", sheet: "Raw" }),
    );
  });
});
