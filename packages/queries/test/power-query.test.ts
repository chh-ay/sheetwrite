import { beforeAll, expect, test } from "bun:test";

import type { PowerQueryCodec, SavedQuery } from "@sheetwrite/core";

import { loadPowerQueryCodec, QueryError } from "../src/node.js";

let codec: PowerQueryCodec;

beforeAll(async () => {
  codec = await loadPowerQueryCodec();
});

// Identities equal names, so the import must reproduce each definition exactly.
const regions: SavedQuery = {
  id: "Regions",
  name: "Regions",
  source: {
    kind: "json",
    sourceId: "https://example.test/regions.json",
    locator: "https://example.test/regions.json",
    columns: [
      { id: "Code", name: "Code", type: "text" },
      { id: "Area", name: "Area", type: "text" },
    ],
    path: ["data"],
  },
  steps: [],
};

const sales: SavedQuery = {
  id: "Sales",
  name: "Sales",
  source: {
    kind: "csv",
    sourceId: "https://example.test/sales.csv",
    locator: "https://example.test/sales.csv",
    columns: [
      { id: "Region", name: "Region", type: "text" },
      { id: "Total", name: "Total", type: "number" },
    ],
    delimiter: 59,
    headers: true,
    emptyIsNull: true,
  },
  steps: [
    { kind: "filter", predicate: { kind: "compare", column: "Total", op: "gt", value: 0 } },
    { kind: "join", input: "Regions", keys: [["Region", "Code"]], join: "inner" },
    {
      kind: "group",
      keys: ["Area"],
      aggregates: [
        { id: "Rows", name: "Rows", op: "countRows" },
        { id: "Sum", name: "Sum", op: "sum", column: "Total" },
      ],
    },
  ],
  output: { table: "sales-table", tableName: "Sales", anchor: { sheet: "s1", row: 0, col: 0 } },
};

test("saved queries round-trip through Power Query M", () => {
  const exported = codec.encode([sales, regions]);
  const imported = codec.decode(exported.section);

  expect(exported.members).toEqual(["Sales", "Regions"]);
  expect(imported.unsupported).toEqual([]);
  const { output: _output, ...withoutOutput } = sales;
  expect(imported.queries).toEqual([regions, withoutOutput]);
  expect(exported.losses).toContainEqual({
    query: "Sales",
    step: null,
    code: "conversion-culture",
  });
});

test("unsupported members keep their original text and reason", () => {
  const section = 'section Section1;\n\nshared Files = Folder.Files("C:\\\\data");\n';
  const imported = codec.decode(section);

  expect(imported.queries).toEqual([]);
  expect(imported.unsupported).toEqual([
    {
      member: "Files",
      reason: "expression",
      detail: "Folder.Files",
      text: 'shared Files = Folder.Files("C:\\\\data");',
    },
  ]);
});

test("a document that is not a Section1 section fails as a query error", () => {
  expect(() => codec.decode("section Other;")).toThrow(QueryError);
});
