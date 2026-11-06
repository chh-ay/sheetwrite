import { beforeAll, expect, it } from "bun:test";

import {
  type DashboardExport,
  initSheetwrite,
  type WorkbookSnapshot,
  type XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, unzipSync } from "fflate";

import { sheetwriteWorkbookBackend } from "../src/index.js";

beforeAll(async () => {
  await initSheetwrite();
});

/** Orders on Data, and the dashboard Dash with a pivot, a slicer, a chart and a KPI card. */
function snapshot(): WorkbookSnapshot {
  const text = (row: number, col: number, value: string | number) => ({
    rowOffset: row,
    colOffset: col,
    value: { kind: "literal" as const, value },
  });
  return {
    schemaVersion: 1,
    workbook: {
      activeSheet: "data",
      dataModel: {
        relationships: [],
        measures: [
          { id: "total", name: "Total", table: "orders", formula: "=SUM(Orders[Amount])" },
        ],
      },
    },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 3,
        columns: ["a", "b"].map((key) => ({ key, header: key, width: 80, type: "text" as const })),
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
      {
        id: "dash",
        name: "Dash",
        order: 1,
        kind: "dashboard",
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
        rowCount: 0,
        columns: [],
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
        charts: [
          {
            id: "chart",
            kind: "column",
            title: "By region",
            anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 480, height: 288 },
            series: [],
            pivot: "by-region",
          },
        ],
        cells: [],
      },
    ],
  };
}

/** What core computes for Dash with the West slicer: the static values of each item. */
function content(chart: WorkbookSnapshot["sheets"][number]["charts"]): DashboardExport[] {
  const definition = chart?.[0];
  if (definition === undefined) throw new Error("the fixture has a chart");
  return [
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
            chart: definition,
            series: [
              {
                name: "Sum of Amount",
                values: [2],
                categories: ["West"],
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
}

async function exported(dashboards?: DashboardExport[]) {
  const warnings: XlsxWorkbookWarning[] = [];
  const input = snapshot();
  const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(
    input,
    { onWarning: (warning) => warnings.push(warning) },
    dashboards ? { dashboards } : undefined,
  );
  return { bytes, warnings, files: unzipSync(bytes) };
}

it("writes a dashboard as a worksheet of its values and a chart with literal data", async () => {
  const { files, warnings } = await exported(content(snapshot().sheets[1]?.charts));

  const sheet = strFromU8(files["xl/worksheets/sheet2.xml"] ?? new Uint8Array());
  // Each item starts at its box: the pivot at A1, the slicer at E1, the KPI card at G1.
  const inline = (ref: string, value: string) =>
    new RegExp(`<c r="${ref}"[^>]*t="inlineStr"[^>]*><is><t[^>]*>${value}</t></is></c>`, "u");
  expect(sheet).toMatch(inline("A1", "By region"));
  expect(sheet).toMatch(inline("A3", "West"));
  expect(sheet).toMatch(/<c r="B3"[^>]*><v>2<\/v><\/c>/u);
  expect(sheet).toMatch(inline("E1", "Region"));
  expect(sheet).toMatch(inline("E2", "West"));
  expect(sheet).toMatch(inline("G1", "Total"));
  expect(sheet).toMatch(/<c r="G2"[^>]*><v>2<\/v><\/c>/u);
  // No native pivot: the dashboard's pivot stays in metadata.
  expect(Object.keys(files).filter((name) => name.startsWith("xl/pivotTables/"))).toEqual([]);

  const chartPart = Object.keys(files).find((name) => name.startsWith("xl/charts/"));
  const chart = strFromU8(files[chartPart ?? ""] ?? new Uint8Array());
  expect(chart).toContain(
    '<c:cat><c:strLit><c:ptCount val="1"/><c:pt idx="0"><c:v>West</c:v></c:pt></c:strLit></c:cat>',
  );
  expect(chart).toContain(
    '<c:val><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>2</c:v></c:pt></c:numLit></c:val>',
  );
  expect(chart).not.toContain("<c:f>");

  expect(warnings.map((warning) => warning.message)).toEqual([
    "Dashboard sheets were written as worksheets of their current values and charts; they are interactive only in Sheetwrite",
  ]);
});

it("opens an exported dashboard as the same dashboard, without its static values", async () => {
  const { bytes } = await exported(content(snapshot().sheets[1]?.charts));
  const warnings: XlsxWorkbookWarning[] = [];
  const reopened = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes, {
    onWarning: (warning) => warnings.push(warning),
  });

  const dash = reopened.sheets.find((sheet) => sheet.name === "Dash");
  const authored = snapshot().sheets[1];
  expect(dash).toMatchObject({
    kind: "dashboard",
    rowCount: 0,
    columns: [],
    cells: [],
    dashboard: authored?.dashboard,
    pivots: authored?.pivots,
    charts: authored?.charts,
  });
  expect(warnings).toEqual([]);
});

it("writes an empty worksheet for a dashboard exported without computed values", async () => {
  const { files } = await exported();
  const sheet = strFromU8(files["xl/worksheets/sheet2.xml"] ?? new Uint8Array());
  expect(sheet).not.toContain("<c ");
});
