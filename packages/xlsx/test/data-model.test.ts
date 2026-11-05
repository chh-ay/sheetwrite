import { beforeAll, expect, it } from "bun:test";

import {
  fromXlsxWorkbook,
  initSheetwrite,
  type PivotDefinition,
  type TableRelationship,
  toXlsxWorkbook,
  type WorkbookSnapshot,
  type WorkbookTable,
  type XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { registerXlsxBackends } from "../src/index.js";

beforeAll(async () => {
  await initSheetwrite();
  registerXlsxBackends();
});

const table = (
  id: string,
  name: string,
  col: number,
  columns: [string, string][],
): WorkbookTable => ({
  id,
  name,
  range: { sheet: "data", start: { row: 0, col }, end: { row: 2, col: col + 1 } },
  columns: columns.map(([columnId, columnName]) => ({ id: columnId, name: columnName })),
  headerRow: true,
  totalsRow: false,
});

const ordersToCustomers: TableRelationship = {
  id: "orders-customers",
  from: { table: "orders", column: "customer" },
  to: { table: "customers", column: "id" },
};

function authored(
  relationships: TableRelationship[],
  pivots: PivotDefinition[] = [],
): WorkbookSnapshot {
  const header = (col: number, value: string) => ({
    rowOffset: 0,
    colOffset: col,
    value: { kind: "literal" as const, value },
  });
  return {
    schemaVersion: 1,
    workbook: {
      activeSheet: "data",
      ...(relationships.length > 0 ? { dataModel: { relationships } } : {}),
    },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 5,
        columns: ["A", "B", "C", "D", "E"].map((key) => ({
          key,
          header: key,
          width: 80,
          type: "text" as const,
        })),
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
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 5,
            cells: [
              header(0, "Customer"),
              header(1, "Amount"),
              header(3, "ID"),
              header(4, "Region"),
            ],
          },
        ],
      },
    ],
  };
}

function collect() {
  const warnings: XlsxWorkbookWarning[] = [];
  return { warnings, onWarning: (warning: XlsxWorkbookWarning) => warnings.push(warning) };
}

it("round-trips relationships and model pivots through Sheetwrite metadata", async () => {
  const pivot: PivotDefinition = {
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
  const { warnings, onWarning } = collect();

  const saved = await toXlsxWorkbook(authored([ordersToCustomers], [pivot]), { onWarning });
  const reopened = await fromXlsxWorkbook(saved);

  expect(reopened.workbook.dataModel).toEqual({ relationships: [ordersToCustomers] });
  expect(reopened.sheets[0]?.pivots).toEqual([pivot]);
  expect(warnings.map((warning) => warning.message)).toEqual([
    expect.stringContaining("By region was not written as a native pivot"),
  ]);
});

const DATA_MODEL_EXTENSION = `<extLst><ext uri="{FCE2AD5D-F65C-4FA6-A056-5C36A1767C68}" xmlns:x15="http://schemas.microsoft.com/office/spreadsheetml/2010/11/main"><x15:dataModel><x15:modelTables><x15:modelTable id="Orders-1" name="Orders" connection="WorksheetConnection_Orders"/><x15:modelTable id="Clients-2" name="Clients" connection="WorksheetConnection_Customers"/><x15:modelTable id="Calendar-3" name="Calendar" connection="ThisWorkbookDataModel"/></x15:modelTables><x15:modelRelationships><x15:modelRelationship fromTable="Orders" fromColumn="Customer" toTable="Clients" toColumn="ID"/><x15:modelRelationship fromTable="Orders" fromColumn="Amount" toTable="Clients" toColumn="Region"/><x15:modelRelationship fromTable="Orders" fromColumn="Customer" toTable="Calendar" toColumn="Date"/></x15:modelRelationships></x15:dataModel></ext></extLst>`;

const connection = (name: string, source: string, id: number) =>
  `<connection id="${id}" name="${name}" type="102" refreshedVersion="6" minRefreshableVersion="5"><extLst><ext uri="{DE250136-89BD-433C-8126-D09CA5730AF9}" xmlns:x15="http://schemas.microsoft.com/office/spreadsheetml/2010/11/main"><x15:connection id=""><x15:rangePr sourceName="${source}"/></x15:connection></ext></extLst></connection>`;

/** `bytes` with an Excel data model that relates the worksheet tables, as Excel writes it. */
function withExcelDataModel(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes);
  const workbook = strFromU8(files["xl/workbook.xml"] ?? new Uint8Array());
  files["xl/workbook.xml"] = strToU8(
    workbook.replace("</workbook>", `${DATA_MODEL_EXTENSION}</workbook>`),
  );
  files["xl/connections.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><connections xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${connection("WorksheetConnection_Orders", "Orders", 1)}${connection("WorksheetConnection_Customers", "Customers", 2)}</connections>`,
  );
  const relationships = strFromU8(files["xl/_rels/workbook.xml.rels"] ?? new Uint8Array());
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    relationships.replace(
      "</Relationships>",
      '<Relationship Id="rIdModel1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/connections" Target="connections.xml"/></Relationships>',
    ),
  );
  const types = strFromU8(files["[Content_Types].xml"] ?? new Uint8Array());
  files["[Content_Types].xml"] = strToU8(
    types.replace(
      "</Types>",
      '<Override PartName="/xl/connections.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml"/></Types>',
    ),
  );
  return zipSync(files);
}

it("imports Excel's active relationships between worksheet tables and reports the rest", async () => {
  const saved = withExcelDataModel(await toXlsxWorkbook(authored([])));
  const { warnings, onWarning } = collect();

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
