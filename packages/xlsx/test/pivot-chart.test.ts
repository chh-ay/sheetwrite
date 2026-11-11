import { beforeAll, expect, it } from "bun:test";

import { type ChartDefinition, type ChartView, initSheetwrite } from "@sheetwrite/core";

import { sheetwriteWorkbookBackend as backend } from "../src/index.js";
import { book, columns, partNames, partText, range, sheet, sheetAt } from "./workbook-fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const CHART: ChartDefinition = {
  id: "by-region-chart",
  kind: "column",
  title: "By region",
  anchor: { row: 0, col: 6, offsetX: 0, offsetY: 0, width: 480, height: 288 },
  series: [],
  pivot: "by-region",
  pivotValues: [0],
};

/** What core resolves for the chart: the pivot's leaf items, without its total. */
const VIEW: ChartView = {
  chart: CHART,
  series: [
    {
      name: "Sum of Amount",
      values: [1, 2],
      categories: ["East", "West"],
      categoryLevels: [],
      numberFormats: [null, null],
      categoryFormats: [null, null],
      numberLocale: null,
      truncated: false,
      referenceError: false,
    },
  ],
};

it("writes a worksheet chart over a pivot with the values it plots and reads it back over the pivot", async () => {
  // Orders at A1:B3 of Data, a pivot over them at D1 and a chart over the pivot.
  const snapshot = book([
    sheet(
      "data",
      "Data",
      [
        ["Region", "Amount"],
        ["East", 1],
        ["West", 2],
      ],
      {
        rowCount: 20,
        columns: columns(12),
        tables: [
          {
            id: "orders",
            name: "Orders",
            range: range("data", 0, 0, 2, 1),
            columns: [
              { id: "region", name: "Region" },
              { id: "amount", name: "Amount" },
            ],
            headerRow: true,
            totalsRow: false,
          },
        ],
        pivots: [
          {
            id: "by-region",
            name: "By region",
            source: { table: "orders" },
            anchor: { row: 0, col: 3 },
            rows: [0],
            columns: [],
            values: [{ field: 1, aggregation: "SUM" }],
          },
        ],
        charts: [CHART],
      },
    ),
  ]);
  const bytes = await backend.toXlsxWorkbook(snapshot, undefined, {
    pivotCharts: new Map([["data", new Map([[CHART.id, VIEW]])]]),
  });

  const chart = partText(
    bytes,
    partNames(bytes).find((name) => name.startsWith("xl/charts/")) ?? "",
  );
  expect(chart).toContain(
    '<c:cat><c:strLit><c:ptCount val="2"/><c:pt idx="0"><c:v>East</c:v></c:pt><c:pt idx="1"><c:v>West</c:v></c:pt></c:strLit></c:cat>',
  );
  expect(chart).toContain(
    '<c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt></c:numLit>',
  );
  expect(sheetAt(await backend.fromXlsxWorkbook(bytes)).charts).toEqual([CHART]);
});
