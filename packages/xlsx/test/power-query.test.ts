import { describe, expect, it } from "bun:test";

import type { PowerQueryCodec, SavedQuery } from "@sheetwrite/core";
import { unzipSync } from "fflate";

import { sheetwriteWorkbookBackend as backend } from "../src/workbook.js";
import { book, collectWarnings, editParts, partText, range, sheet } from "./workbook-fixtures.js";

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

const powerQuery: PowerQueryCodec = {
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

const snapshot = (queries: SavedQuery[] = [sales]) =>
  book(
    [
      sheet("s1", "Data", [["Region"], ["North"]], {
        rowCount: 3,
        tables: [
          {
            id: "sales-table",
            name: "Sales",
            range: range("s1", 0, 0, 1, 0),
            columns: [{ id: "region", name: "Region" }],
            headerRow: true,
            totalsRow: false,
          },
        ],
      }),
    ],
    queries.length ? { queries } : {},
  );

describe("Power Query packaging", () => {
  it("reports each M difference and binds the output table to a new connection", async () => {
    const { warnings, onWarning } = collectWarnings();
    const bytes = await backend.toXlsxWorkbook(snapshot(), { onWarning, powerQuery });
    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: "query-loss",
        message: expect.stringContaining("host-source"),
      }),
    );
    const tableXml = partText(bytes, "xl/tables/table1.xml");
    expect(tableXml).toContain('tableType="queryTable"');
    expect(tableXml).toContain('queryTableFieldId="1"');
    expect(partText(bytes, "xl/tables/_rels/table1.xml.rels")).toContain("queryTable1.xml");
    expect(partText(bytes, "xl/queryTables/queryTable1.xml")).toContain('connectionId="1"');
    expect(partText(bytes, "[Content_Types].xml")).toContain("/xl/connections.xml");
  });

  it("binds a re-exported table to its kept connection without rewriting the kept parts", async () => {
    const first = await backend.toXlsxWorkbook(snapshot(), { powerQuery });
    const imported = await backend.fromXlsxWorkbook(first, { powerQuery });
    const second = await backend.toXlsxWorkbook(imported, { powerQuery });

    expect(imported.workbook.queries).toEqual([sales]);
    expect(unzipSync(second)["xl/connections.xml"]).toEqual(unzipSync(first)["xl/connections.xml"]);
    expect(partText(second, "xl/queryTables/queryTable1.xml")).toContain('connectionId="1"');
  });

  it("restores definitions from hidden metadata when no M parts were written", async () => {
    const valuesOnly = await backend.toXlsxWorkbook(snapshot());
    expect((await backend.fromXlsxWorkbook(valuesOnly)).workbook.queries).toEqual([sales]);
  });

  it("reads a UTF-16 DataMashup item and reports one that cannot be read", async () => {
    const item = `<?xml version="1.0" encoding="utf-16"?><DataMashup xmlns="http://schemas.microsoft.com/DataMashup">${btoa(String.fromCharCode(0, 0, 0, 0))}</DataMashup>`;
    const utf16 = new Uint8Array(2 + item.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let index = 0; index < item.length; index++) utf16[2 + index * 2] = item.charCodeAt(index);
    const withItem = editParts(await backend.toXlsxWorkbook(snapshot([])), {
      "customXml/item9.xml": utf16,
      "xl/_rels/workbook.xml.rels": (xml) =>
        xml.replace(
          "</Relationships>",
          '<Relationship Id="rIdItem" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item9.xml"/></Relationships>',
        ),
    });

    const { warnings, onWarning } = collectWarnings();
    const imported = await backend.fromXlsxWorkbook(withItem, { onWarning, powerQuery });
    expect(imported.workbook.queries).toBeUndefined();
    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: "query-loss",
        message: expect.stringContaining("could not be read"),
      }),
    );
  });
});
