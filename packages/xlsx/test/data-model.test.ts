import { beforeAll, expect, it } from "bun:test";

import {
  fromXlsxWorkbook,
  initSheetwrite,
  type PivotDefinition,
  type TableRelationship,
  toXlsxWorkbook,
  type WorkbookSnapshot,
  type WorkbookTable,
} from "@sheetwrite/core";

import { sheetwriteWorkbookBackend, xlsxAddon } from "../src/index.js";
import {
  book,
  cellsOf,
  collectWarnings,
  editParts,
  partText,
  range,
  sheet,
  sheetAt,
} from "./workbook-fixtures.js";

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

const table = (
  id: string,
  name: string,
  col: number,
  columns: [string, string][],
): WorkbookTable => ({
  id,
  name,
  range: range("data", 0, col, 2, col + 1),
  columns: columns.map(([columnId, columnName]) => ({ id: columnId, name: columnName })),
  headerRow: true,
  totalsRow: false,
});

const ordersToCustomers: TableRelationship = {
  id: "orders-customers",
  from: { table: "orders", column: "customer" },
  to: { table: "customers", column: "id" },
};

const byRegion: PivotDefinition = {
  id: "by-region",
  name: "By region",
  source: {
    model: {
      table: "orders",
      fields: [
        { table: "customers", column: "region" },
        { table: "orders", column: "amount" },
      ],
    },
  },
  anchor: { row: 4, col: 0 },
  rows: [0],
  columns: [],
  values: [{ field: 1, aggregation: "SUM" }],
};

/** Orders and Customers tables on Data, with `dataModel` and `pivots` when given. */
function authored(
  dataModel?: WorkbookSnapshot["workbook"]["dataModel"],
  pivots: PivotDefinition[] = [],
): WorkbookSnapshot {
  return book(
    [
      sheet("data", "Data", [["Customer", "Amount", null, "ID", "Region"]], {
        rowCount: 10,
        tables: [
          table("orders", "Orders", 0, [
            ["customer", "Customer"],
            ["amount", "Amount"],
          ]),
          table("customers", "Customers", 3, [
            ["id", "ID"],
            ["region", "Region"],
          ]),
        ],
        ...(pivots.length > 0 ? { pivots } : {}),
      }),
    ],
    dataModel ? { dataModel } : {},
  );
}

it("round-trips relationships, measures and model pivots through Sheetwrite metadata", async () => {
  const measure = { id: "total", name: "Total", table: "orders", formula: "=SUM(Orders[Amount])" };
  const { warnings, onWarning } = collectWarnings();
  for (const dataModel of [
    { relationships: [ordersToCustomers], measures: [measure] },
    { relationships: [], measures: [measure] },
  ]) {
    const pivots = dataModel.relationships.length > 0 ? [byRegion] : [];
    const reopened = await fromXlsxWorkbook(
      await toXlsxWorkbook(authored(dataModel, pivots), { onWarning }),
    );
    expect(reopened.workbook.dataModel).toEqual(dataModel);
    expect(sheetAt(reopened).pivots).toEqual(pivots.length > 0 ? pivots : undefined);
  }
  expect(warnings.map((warning) => warning.message)).toEqual([
    expect.stringContaining("By region was not written as a native pivot"),
  ]);
});

it("writes a model pivot's current output as cells, and reopens it as the pivot", async () => {
  const pivot: PivotDefinition = {
    ...byRegion,
    values: [{ field: 1, aggregation: "SUM", numberFormat: "0.00" }, { measure: "share" }],
  };
  const input = authored(
    {
      relationships: [ordersToCustomers],
      measures: [{ id: "share", name: "Share", table: "orders", formula: "=SUM(Orders[Amount])" }],
    },
    [pivot],
  );
  // What core computes for the pivot: a header row, one region and the total.
  const pivotOutputs = [
    {
      sheet: "data",
      items: [
        {
          id: "by-region",
          cells: [
            ["Region", "Sum of Amount", "Share"],
            ["North", 7, 7],
            ["Total", 7, 7],
          ],
          numberFormats: [
            [null, null, null],
            [null, "0.00", null],
            [null, "0.00", null],
          ],
        },
      ],
    },
  ];
  const { warnings, onWarning } = collectWarnings();
  const saved = await sheetwriteWorkbookBackend.toXlsxWorkbook(
    input,
    { onWarning },
    { pivotOutputs },
  );

  const xml = partText(saved, "xl/worksheets/sheet1.xml");
  expect(xml).toMatch(/<c r="A5"[^>]*t="inlineStr"[^>]*><is><t[^>]*>Region<\/t>/u);
  expect(xml).toMatch(/<c r="A7"[^>]*t="inlineStr"[^>]*><is><t[^>]*>Total<\/t>/u);
  // The Sum value keeps its field's number format (0.00 is Excel's built-in 2); the measure is General.
  expect(partText(saved, "xl/styles.xml")).toMatch(/<xf numFmtId="2"/u);
  expect(xml).toMatch(/<c r="B6" s="1"><v>7<\/v><\/c>/u);
  expect(xml).toMatch(/<c r="C6"><v>7<\/v><\/c>/u);
  expect(warnings.map((warning) => warning.message)).toEqual([
    "Pivot table By region was not written as a native pivot because a model pivot needs an Excel data-model binary; its current values were written as cells and it remains in Sheetwrite metadata",
  ]);

  // Sheetwrite reopens the live pivot; its output cells are not user values.
  const reopened = await sheetwriteWorkbookBackend.fromXlsxWorkbook(saved);
  expect(sheetAt(reopened).pivots).toEqual([
    {
      ...pivot,
      savedOutput: {
        rows: 3,
        cols: 3,
        cells: ["Region", "Sum of Amount", "Share", "North", 7, 7, "Total", 7, 7],
      },
    },
  ]);
  expect(cellsOf(reopened).filter((cell) => cell.row >= 4)).toEqual([]);
});

it("keeps a cell another application changed inside a kept pivot's output", async () => {
  const pivot: PivotDefinition = {
    ...byRegion,
    source: { model: { table: "orders", fields: [{ table: "orders", column: "amount" }] } },
    rows: [],
    values: [{ field: 0, aggregation: "SUM" }],
  };
  const pivotOutputs = [
    {
      sheet: "data",
      items: [
        { id: "by-region", cells: [["Sum of Amount"], [7]], numberFormats: [[null], [null]] },
      ],
    },
  ];
  const saved = await sheetwriteWorkbookBackend.toXlsxWorkbook(
    authored(undefined, [pivot]),
    {},
    { pivotOutputs },
  );
  // Excel saves 9 over the value 7.
  const edited = editParts(saved, {
    "xl/worksheets/sheet1.xml": (xml) => xml.replace(/(<c r="A6"[^>]*><v>)7(<\/v>)/u, "$19$2"),
  });

  const reopened = await sheetwriteWorkbookBackend.fromXlsxWorkbook(edited);
  expect(
    cellsOf(reopened)
      .filter((cell) => cell.row >= 4)
      .map((cell) => [cell.row, cell.value]),
  ).toEqual([[5, { kind: "literal", value: 9 }]]);
});

const DATA_MODEL_EXTENSION = `<extLst><ext uri="{FCE2AD5D-F65C-4FA6-A056-5C36A1767C68}" xmlns:x15="http://schemas.microsoft.com/office/spreadsheetml/2010/11/main"><x15:dataModel><x15:modelTables><x15:modelTable id="Orders-1" name="Orders" connection="WorksheetConnection_Orders"/><x15:modelTable id="Clients-2" name="Clients" connection="WorksheetConnection_Customers"/><x15:modelTable id="Calendar-3" name="Calendar" connection="ThisWorkbookDataModel"/></x15:modelTables><x15:modelRelationships><x15:modelRelationship fromTable="Orders" fromColumn="Customer" toTable="Clients" toColumn="ID"/><x15:modelRelationship fromTable="Orders" fromColumn="Amount" toTable="Clients" toColumn="Region"/><x15:modelRelationship fromTable="Orders" fromColumn="Customer" toTable="Calendar" toColumn="Date"/></x15:modelRelationships></x15:dataModel></ext></extLst>`;

const connection = (name: string, source: string, id: number) =>
  `<connection id="${id}" name="${name}" type="102" refreshedVersion="6" minRefreshableVersion="5"><extLst><ext uri="{DE250136-89BD-433C-8126-D09CA5730AF9}" xmlns:x15="http://schemas.microsoft.com/office/spreadsheetml/2010/11/main"><x15:connection id=""><x15:rangePr sourceName="${source}"/></x15:connection></ext></extLst></connection>`;

it("imports Excel's active relationships between worksheet tables and reports the rest", async () => {
  // An Excel data model that relates the worksheet tables, as Excel writes it.
  const saved = editParts(await toXlsxWorkbook(authored()), {
    "xl/workbook.xml": (xml) => xml.replace("</workbook>", `${DATA_MODEL_EXTENSION}</workbook>`),
    "xl/connections.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><connections xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${connection("WorksheetConnection_Orders", "Orders", 1)}${connection("WorksheetConnection_Customers", "Customers", 2)}</connections>`,
    "xl/_rels/workbook.xml.rels": (xml) =>
      xml.replace(
        "</Relationships>",
        '<Relationship Id="rIdModel1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/connections" Target="connections.xml"/></Relationships>',
      ),
    "[Content_Types].xml": (xml) =>
      xml.replace(
        "</Types>",
        '<Override PartName="/xl/connections.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml"/></Types>',
      ),
  });
  const { warnings, onWarning } = collectWarnings();
  const reopened = await fromXlsxWorkbook(saved, { onWarning });

  // The model table "Clients" loads the worksheet table "Customers" through its connection.
  expect(reopened.workbook.dataModel).toEqual({
    relationships: [{ ...ordersToCustomers, id: "excel-relationship-1" }],
  });
  expect(warnings.map((warning) => warning.message)).toEqual([
    "Excel data model relationship Orders[Amount] → Clients[Region] was not imported because it would join two tables a second time",
    "Excel data model relationship Orders[Customer] → Calendar[Date] was not imported because a table is not a worksheet table",
  ]);
});
