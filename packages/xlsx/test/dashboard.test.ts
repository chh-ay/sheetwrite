import { beforeAll, expect, it } from "bun:test";

import { type DashboardExport, initSheetwrite, type WorkbookSnapshot } from "@sheetwrite/core";

import { sheetwriteWorkbookBackend as backend } from "../src/index.js";
import {
  book,
  collectWarnings,
  partNames,
  partText,
  range,
  sheet,
  sheetNamed,
} from "./workbook-fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const CHART = {
  id: "chart",
  kind: "column" as const,
  title: "By region",
  anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 480, height: 288 },
  series: [],
  pivot: "by-region",
};

/** Orders on Data, and the dashboard Dash with a pivot, a slicer, a chart and a KPI card. */
function snapshot(): WorkbookSnapshot {
  return book(
    [
      sheet(
        "data",
        "Data",
        [
          ["Region", "Amount"],
          ["East", 1],
          ["West", 2],
        ],
        {
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
        },
      ),
      sheet("dash", "Dash", [], {
        kind: "dashboard",
        rowCount: 0,
        columns: [],
        dashboard: {
          items: [
            { id: "sales", box: { x: 0, y: 0, w: 4, h: 4 }, kind: "pivot", pivot: "by-region" },
            {
              id: "region",
              box: { x: 4, y: 0, w: 2, h: 4 },
              kind: "slicer",
              field: { table: "orders", column: "region" },
              selected: ["West"],
            },
            { id: "kpi", box: { x: 6, y: 0, w: 2, h: 2 }, kind: "kpi", measure: "total" },
            { id: "chart-item", box: { x: 0, y: 4, w: 6, h: 8 }, kind: "chart", chart: "chart" },
          ],
        },
        pivots: [
          {
            id: "by-region",
            name: "By region",
            source: { table: "orders" },
            anchor: { row: 0, col: 0 },
            rows: [0],
            columns: [],
            values: [{ field: 1, aggregation: "SUM", numberFormat: "0.00" }],
          },
        ],
        charts: [CHART],
      }),
    ],
    {
      dataModel: {
        relationships: [],
        measures: [
          { id: "total", name: "Total", table: "orders", formula: "=SUM(Orders[Amount])" },
        ],
      },
    },
  );
}

/** What core computes for Dash with the West slicer: the static values of each item. */
const DASHBOARDS: DashboardExport[] = [
  {
    sheet: "dash",
    items: [
      {
        id: "sales",
        cells: [["By region"], ["Region", "Sum of Amount"], ["West", 2], ["Total", 2]],
        numberFormats: [[null], [null, null], [null, "0.00"], [null, "0.00"]],
      },
      { id: "region", cells: [["Region"], ["West"]], numberFormats: [[null], [null]] },
      { id: "kpi", cells: [["Total"], [2]], numberFormats: [[null], [null]] },
      {
        id: "chart-item",
        cells: [],
        numberFormats: [],
        chart: {
          chart: CHART,
          series: [
            {
              name: "Sum of Amount",
              values: [2],
              categories: ["West"],
              categoryLevels: [],
              numberFormats: ["0.00"],
              categoryFormats: [null],
              numberLocale: null,
              truncated: false,
              referenceError: false,
            },
          ],
        },
      },
    ],
  },
];

it("writes a dashboard as a worksheet of its values and a chart, and opens it as the same dashboard", async () => {
  const { warnings, onWarning } = collectWarnings();
  const bytes = await backend.toXlsxWorkbook(snapshot(), { onWarning }, { dashboards: DASHBOARDS });

  const xml = partText(bytes, "xl/worksheets/sheet2.xml");
  // Each item starts at its box: the pivot at A1, the slicer at E1, the KPI card at G1.
  for (const [ref, value] of [
    ["A1", "By region"],
    ["A3", "West"],
    ["E1", "Region"],
    ["E2", "West"],
    ["G1", "Total"],
  ]) {
    expect(xml).toMatch(
      new RegExp(`<c r="${ref}"[^>]*t="inlineStr"[^>]*><is><t[^>]*>${value}</t></is></c>`, "u"),
    );
  }
  expect(xml).toMatch(/<c r="B3"[^>]*><v>2<\/v><\/c>/u);
  expect(xml).toMatch(/<c r="G2"[^>]*><v>2<\/v><\/c>/u);
  // No native pivot: the dashboard's pivot stays in metadata, so the chart is not a PivotChart.
  expect(partNames(bytes).filter((name) => name.startsWith("xl/pivotTables/"))).toEqual([]);
  const chartPart = partNames(bytes).find((name) => name.startsWith("xl/charts/")) ?? "";
  const chart = partText(bytes, chartPart);
  // The chart reads West and 2 where the pivot item wrote them, with the values as its cache.
  expect(chart).toContain(
    '<c:cat><c:strRef><c:f>&apos;Dash&apos;!$A$3:$A$3</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>West</c:v></c:pt></c:strCache></c:strRef></c:cat>',
  );
  expect(chart).toContain(
    '<c:val><c:numRef><c:f>&apos;Dash&apos;!$B$3:$B$3</c:f><c:numCache><c:formatCode>0.00</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>2</c:v></c:pt></c:numCache></c:numRef></c:val>',
  );
  expect(chart).not.toContain("<c:pivotSource>");
  expect(warnings.map((warning) => warning.message)).toEqual([
    "Dashboard sheets were written as worksheets of their current values and charts; they are interactive only in Sheetwrite",
  ]);

  const reopenWarnings = collectWarnings();
  const reopened = await backend.fromXlsxWorkbook(bytes, { onWarning: reopenWarnings.onWarning });
  const authored = sheetNamed(snapshot(), "Dash");
  expect(sheetNamed(reopened, "Dash")).toMatchObject({
    kind: "dashboard",
    rowCount: 0,
    columns: [],
    cells: [],
    dashboard: authored.dashboard,
    pivots: authored.pivots,
    charts: authored.charts,
  });
  expect(reopenWarnings.warnings).toEqual([]);
});

it("writes an empty worksheet for a dashboard exported without computed values", async () => {
  const bytes = await backend.toXlsxWorkbook(snapshot());
  expect(partText(bytes, "xl/worksheets/sheet2.xml")).not.toContain("<c ");
});
