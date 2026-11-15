import { describe, expect, it } from "bun:test";

import type {
  PowerQueryCodec,
  SavedQuery,
  WorkbookSnapshot,
  XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { sheetwriteWorkbookBackend as backend } from "../src/workbook.js";

// A codec with fixed M text: these tests cover packaging, not M translation.
const SECTION = "section Section1;\n\nshared Sales = let\n    Source = 1\nin\n    Source;\n";

const sales: SavedQuery = {
  id: "sales",
  name: "Sales",
  source: {
    kind: "host",
    sourceId: "feed",
    columns: [{ id: "region", name: "Region", type: "text" }],
  },
  steps: [],
  output: { table: "sales-table", tableName: "Sales", anchor: { sheet: "s1", row: 0, col: 0 } },
};

const codec: PowerQueryCodec = {
  encode: (queries) => ({
    section: SECTION,
    members: queries.map((query) => query.name),
    losses: [{ query: "sales", step: null, code: "host-source" }],
  }),
  decode: (section) => {
    if (!section.startsWith("section Section1;")) throw new Error("not a section");
    const { output: _output, ...definition } = sales;
    return { queries: [definition], unsupported: [] };
  },
};

function snapshot(queries: SavedQuery[] = [sales]): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s1", ...(queries.length ? { queries } : {}) },
    sheets: [
      {
        id: "s1",
        name: "Data",
        order: 0,
        rowCount: 3,
        columns: [{ key: "a", header: "A", width: 80, type: "text" }],
        tables: [
          {
            id: "sales-table",
            name: "Sales",
            range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
            columns: [{ id: "region", name: "Region" }],
            headerRow: true,
            totalsRow: false,
          },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 2,
            colCount: 1,
            cells: [
              { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "Region" } },
              { rowOffset: 1, colOffset: 0, value: { kind: "literal", value: "North" } },
            ],
          },
        ],
      },
    ],
  };
}

function collect(warnings: XlsxWorkbookWarning[], withCodec = true) {
  return {
    onWarning: (warning: XlsxWorkbookWarning) => warnings.push(warning),
    ...(withCodec ? { powerQuery: codec } : {}),
  };
}

function addItem(
  file: Uint8Array,
  item: Uint8Array,
  extra: Record<string, Uint8Array> = {},
): Uint8Array {
  const files = { ...unzipSync(file), ...extra };
  files["customXml/item9.xml"] = item;
  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"] ?? new Uint8Array());
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    rels.replace(
      "</Relationships>",
      '<Relationship Id="rIdItem" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item9.xml"/></Relationships>',
    ),
  );
  return zipSync(files);
}

describe("Power Query packaging", () => {
  it("reports each M difference and binds the output table to a new connection", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const files = unzipSync(await backend.toXlsxWorkbook(snapshot(), collect(warnings)));
    const tableXml = strFromU8(files["xl/tables/table1.xml"] ?? new Uint8Array());

    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: "query-loss",
        message: expect.stringContaining("host-source"),
      }),
    );
    expect(tableXml).toContain('tableType="queryTable"');
    expect(tableXml).toContain('queryTableFieldId="1"');
    expect(strFromU8(files["xl/tables/_rels/table1.xml.rels"] ?? new Uint8Array())).toContain(
      "queryTable1.xml",
    );
    expect(strFromU8(files["xl/queryTables/queryTable1.xml"] ?? new Uint8Array())).toContain(
      'connectionId="1"',
    );
    expect(strFromU8(files["[Content_Types].xml"] ?? new Uint8Array())).toContain(
      "/xl/connections.xml",
    );
  });

  it("binds a re-exported table to its kept connection without rewriting the kept parts", async () => {
    const first = await backend.toXlsxWorkbook(snapshot(), collect([]));
    const imported = await backend.fromXlsxWorkbook(first, collect([]));
    const files = unzipSync(await backend.toXlsxWorkbook(imported, collect([])));

    expect(imported.workbook.queries).toEqual([sales]);
    expect(files["xl/connections.xml"]).toEqual(unzipSync(first)["xl/connections.xml"]);
    expect(strFromU8(files["xl/queryTables/queryTable1.xml"] ?? new Uint8Array())).toContain(
      'connectionId="1"',
    );
  });

  it("restores definitions from hidden metadata when no M parts were written", async () => {
    const valuesOnly = await backend.toXlsxWorkbook(snapshot(), collect([], false));

    expect(
      (await backend.fromXlsxWorkbook(valuesOnly, collect([], false))).workbook.queries,
    ).toEqual([sales]);
  });

  it("reads a UTF-16 DataMashup item and reports one that cannot be read", async () => {
    const base = await backend.toXlsxWorkbook(snapshot([]), collect([], false));
    const binary = new Uint8Array(4);
    const item = `<?xml version="1.0" encoding="utf-16"?><DataMashup xmlns="http://schemas.microsoft.com/DataMashup">${btoa(String.fromCharCode(...binary))}</DataMashup>`;
    const utf16 = new Uint8Array(2 + item.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let index = 0; index < item.length; index++) utf16[2 + index * 2] = item.charCodeAt(index);

    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await backend.fromXlsxWorkbook(addItem(base, utf16), collect(warnings));

    expect(imported.workbook.queries).toBeUndefined();
    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: "query-loss",
        message: expect.stringContaining("could not be read"),
      }),
    );
  });
});
