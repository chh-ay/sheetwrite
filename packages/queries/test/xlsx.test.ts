import { beforeAll, describe, expect, test } from "bun:test";

import type {
  PowerQueryCodec,
  SavedQuery,
  WorkbookSnapshot,
  XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { sheetwriteWorkbookBackend as backend } from "@sheetwrite/xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { loadPowerQueryCodec } from "../src/node.js";

let codec: PowerQueryCodec;

beforeAll(async () => {
  codec = await loadPowerQueryCodec();
});

const sales: SavedQuery = {
  id: "sales",
  name: "Sales",
  source: {
    kind: "csv",
    sourceId: "feed",
    locator: "https://example.test/sales.csv",
    columns: [
      { id: "region", name: "Region", type: "text" },
      { id: "total", name: "Total", type: "number" },
    ],
  },
  steps: [{ kind: "filter", predicate: { kind: "compare", column: "total", op: "gt", value: 0 } }],
  output: { table: "sales-table", tableName: "Sales", anchor: { sheet: "s1", row: 0, col: 0 } },
};

const ROWS = [
  ["Region", "Total"],
  ["North", 5],
  ["South", 7],
];

/** One sheet with the Sales table in A1:B3, and `queries` saved in the workbook. */
function snapshot(queries: SavedQuery[] = [sales]): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s1", ...(queries.length ? { queries } : {}) },
    sheets: [
      {
        id: "s1",
        name: "Data",
        order: 0,
        rowCount: 4,
        columns: [
          { key: "a", header: "A", width: 80, type: "text" },
          { key: "b", header: "B", width: 80, type: "number" },
        ],
        tables: [
          {
            id: "sales-table",
            name: "Sales",
            range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 2, col: 1 } },
            columns: [
              { id: "region", name: "Region" },
              { id: "total", name: "Total" },
            ],
            headerRow: true,
            totalsRow: false,
          },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 3,
            colCount: 2,
            cells: ROWS.flatMap((row, rowOffset) =>
              row.map((value, colOffset) => ({
                rowOffset,
                colOffset,
                value: { kind: "literal" as const, value },
              })),
            ),
          },
        ],
      },
    ],
  };
}

type Warnings = XlsxWorkbookWarning[];

function options(warnings: Warnings, withCodec: boolean) {
  return {
    onWarning: (warning: XlsxWorkbookWarning) => warnings.push(warning),
    ...(withCodec ? { powerQuery: codec } : {}),
  };
}

const text = (bytes: Uint8Array | undefined) => strFromU8(bytes ?? new Uint8Array());
const isMashupItem = (name: string) => /^customXml\/item\d+\.xml$/u.test(name);

/** The decoded Section1.m of a written DataMashup item ([MS-QDEFF] 2.2). */
function sectionOf(files: Record<string, Uint8Array>): string | undefined {
  for (const [name, bytes] of Object.entries(files)) {
    if (!isMashupItem(name)) continue;

    const match = /<DataMashup[^>]*>([^<]+)<\/DataMashup>/u.exec(strFromU8(bytes));
    if (!match?.[1]) continue;

    const binary = Uint8Array.from(atob(match[1]), (character) => character.charCodeAt(0));
    const length = new DataView(binary.buffer).getUint32(4, true);
    const parts = unzipSync(binary.subarray(8, 8 + length));
    const section = parts["Formulas/Section1.m"];
    return section ? strFromU8(section) : undefined;
  }

  return undefined;
}

describe("Power Query round trip", () => {
  test("keeps an unchanged mashup byte-for-byte and its table binding on the next save", async () => {
    const first = await backend.toXlsxWorkbook(snapshot(), options([], true));
    const imported = await backend.fromXlsxWorkbook(first, options([], true));
    const second = unzipSync(await backend.toXlsxWorkbook(imported, options([], true)));
    const original = unzipSync(first);
    const item = Object.keys(original).find(isMashupItem) ?? "";

    expect(sectionOf(original)).toBe(codec.encode([sales]).section);
    expect(second[item]).toEqual(original[item]);
    expect(second["xl/connections.xml"]).toEqual(original["xl/connections.xml"]);
    expect(text(second["xl/tables/table1.xml"])).toContain('tableType="queryTable"');
  });

  test("restores exact definitions written by Sheetwrite, with or without a codec", async () => {
    const file = await backend.toXlsxWorkbook(snapshot(), options([], true));

    for (const withCodec of [true, false]) {
      const imported = await backend.fromXlsxWorkbook(file, options([], withCodec));
      expect(imported.workbook.queries).toEqual([sales]);
    }
  });

  test("reads Excel-style M through the codec and binds outputs by FillTarget", async () => {
    const section = `section Section1;

shared Orders = let
    Source = Excel.CurrentWorkbook(){[Name="Input"]}[Content],
    Typed = Table.TransformColumnTypes(Source,{{"Region", type text}, {"Total", Int64.Type}}),
    Kept = Table.SelectRows(Typed, each [Total] > 1)
in
    Kept;

shared Files = Folder.Files("C:\\data");
`;
    const warnings: Warnings = [];
    const file = await withMashup(section, "Orders");
    const imported = await backend.fromXlsxWorkbook(file, options(warnings, true));

    expect(imported.workbook.queries).toEqual([
      {
        id: "Orders",
        name: "Orders",
        source: {
          kind: "host",
          sourceId: "Input",
          columns: [
            { id: "Region", name: "Region", type: "text" },
            { id: "Total", name: "Total", type: "number" },
          ],
        },
        steps: [
          { kind: "filter", predicate: { kind: "compare", column: "Total", op: "gt", value: 1 } },
        ],
        output: {
          table: expect.any(String),
          tableName: "Sales",
          anchor: { sheet: expect.any(String), row: 0, col: 0 },
        },
      },
    ]);
    expect(warnings.map((warning) => warning.message)).toContainEqual(
      expect.stringContaining("Power Query member Files was kept as M text"),
    );
    // The panel lists kept members from the mashup graph, which leaves with the kept part.
    const mashup = imported.workbook.xlsxSource?.graphs.find(
      (graph) => graph.unsupportedQueries !== undefined,
    );
    expect(mashup?.unsupportedQueries).toEqual([{ member: "Files", reason: "expression" }]);
  });

  test("writes retained parts back byte-for-byte without a codec until the saved queries change", async () => {
    const section = 'section Section1;\n\nshared Files = Folder.Files("C:\\\\data");\n';
    const original = await withMashup(section, "Files");
    const imported = await backend.fromXlsxWorkbook(original, options([], false));
    const unchanged = unzipSync(await backend.toXlsxWorkbook(imported, options([], false)));

    expect(imported.workbook.queries).toBeUndefined();
    expect(unchanged["customXml/item1.xml"]).toEqual(unzipSync(original)["customXml/item1.xml"]);

    imported.workbook.queries = [sales];
    const warnings: Warnings = [];
    const changed = unzipSync(await backend.toXlsxWorkbook(imported, options(warnings, false)));

    expect(sectionOf(changed)).toBeUndefined();
    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: "query-loss",
        message: expect.stringContaining("saved queries changed"),
      }),
    );
  });
});

/**
 * A query-free Sales workbook plus a DataMashup item built from [MS-QDEFF]:
 * version 0, then length-prefixed Package Parts (OPC with Formulas/Section1.m),
 * Permissions, Metadata and a one-byte null Permission Bindings stream.
 * `member` fills the Sales table.
 */
async function withMashup(section: string, member: string): Promise<Uint8Array> {
  const files = unzipSync(await backend.toXlsxWorkbook(snapshot([]), options([], false)));
  const u32 = (value: number): Uint8Array => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    return bytes;
  };
  const join = (parts: Uint8Array[]): Uint8Array => {
    const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  };
  const prefixed = (bytes: Uint8Array) => join([u32(bytes.length), bytes]);
  const parts = zipSync({
    "[Content_Types].xml": strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="m" ContentType="text/plain"/><Default Extension="xml" ContentType="text/xml"/></Types>',
    ),
    "Config/Package.xml": strToU8(
      "<Package><Version>2.21.0.0</Version><MinVersion>2.21.0.0</MinVersion><Culture>en-US</Culture></Package>",
    ),
    "Formulas/Section1.m": strToU8(section),
  });
  const metadataXml = strToU8(
    `<LocalPackageMetadataFile><Items><Item><ItemLocation><ItemType>Formula</ItemType><ItemPath>Section1/${member}</ItemPath></ItemLocation><StableEntries><Entry Type="FillEnabled" Value="l1"/><Entry Type="FillTarget" Value="sSales"/></StableEntries></Item></Items></LocalPackageMetadataFile>`,
  );
  const binary = join([
    u32(0),
    prefixed(parts),
    prefixed(strToU8("<PermissionList/>")),
    prefixed(join([u32(0), prefixed(metadataXml), u32(0)])),
    prefixed(Uint8Array.of(0)),
  ]);
  const item = `<?xml version="1.0" encoding="utf-8"?><DataMashup xmlns="http://schemas.microsoft.com/DataMashup">${btoa(String.fromCharCode(...binary))}</DataMashup>`;

  files["customXml/item1.xml"] = strToU8(item);
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    text(files["xl/_rels/workbook.xml.rels"]).replace(
      "</Relationships>",
      '<Relationship Id="rIdMashup" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/></Relationships>',
    ),
  );
  return zipSync(files);
}
