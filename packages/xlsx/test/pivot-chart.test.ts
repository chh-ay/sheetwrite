import { beforeAll, expect, it } from "bun:test";

import {
  type ChartDefinition,
  type ChartView,
  initSheetwrite,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { strFromU8, unzipSync } from "fflate";

import { sheetwriteWorkbookBackend } from "../src/index.js";

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

/** Orders at A1:B3 of Data, a pivot over them at D1 and a chart over the pivot. */
function snapshot(): WorkbookSnapshot {
  const text = (row: number, col: number, value: string | number) => ({
    rowOffset: row,
    colOffset: col,
    value: { kind: "literal" as const, value },
  });
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "data" },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 20,
        columns: Array.from({ length: 12 }, (_, index) => ({
          key: `c${index}`,
          header: `C${index}`,
          width: 80,
          type: "text" as const,
        })),
        tables: [
          {
            id: "orders",
            name: "Orders",
            range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 2, col: 1 } },
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
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 3,
            colCount: 2,
            cells: [
              text(0, 0, "Region"),
              text(0, 1, "Amount"),
              text(1, 0, "East"),
              text(1, 1, 1),
              text(2, 0, "West"),
              text(2, 1, 2),
            ],
          },
        ],
      },
    ],
  };
}

/** What core resolves for the chart: the pivot's leaf items, without its total. */
const VIEW: ChartView = {
  chart: CHART,
  series: [
    {
      name: "Sum of Amount",
      values: [1, 2],
      categories: ["East", "West"],
      numberFormats: [null, null],
      categoryFormats: [null, null],
      numberLocale: null,
      truncated: false,
      referenceError: false,
    },
  ],
};

it("writes a worksheet chart over a pivot with the values it plots and reads it back over the pivot", async () => {
  const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot(), undefined, {
    pivotCharts: new Map([["data", new Map([[CHART.id, VIEW]])]]),
  });

  const files = unzipSync(bytes);
  const chartPart = Object.keys(files).find((name) => name.startsWith("xl/charts/"));
  const chart = strFromU8(files[chartPart ?? ""] ?? new Uint8Array());
  expect(chart).toContain(
    '<c:cat><c:strLit><c:ptCount val="2"/><c:pt idx="0"><c:v>East</c:v></c:pt><c:pt idx="1"><c:v>West</c:v></c:pt></c:strLit></c:cat>',
  );
  expect(chart).toContain(
    '<c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt></c:numLit>',
  );

  const reopened = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
  expect(reopened.sheets[0]?.charts).toEqual([CHART]);
});
