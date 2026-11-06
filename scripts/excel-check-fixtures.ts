/**
 * Writes the input files of the Excel checks for external links (#226),
 * measures (#230) and dashboards (#231) to test/fixtures/excel-checks/.
 * Sheetwrite writes each file, through the same export a user runs, with the
 * full engine, so model pivots, measures and dashboards hold their values.
 *
 *   bun run build && bun scripts/excel-check-fixtures.ts
 *
 * The steps and the expected results are in docs/contributing/excel-checks.md.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { GlobalRegistrator } from "@happy-dom/global-registrator";

import type {
  PivotDefinition as Pivot,
  WorkbookSnapshot as Snapshot,
  WorkbookTable as Table,
} from "../packages/core/dist/index.js";

GlobalRegistrator.register();

const formulas = await import("../packages/formulas/loader-node.mjs");
const core = await import("../packages/core/dist/index.js");
const { registerXlsxBackends } = await import("../packages/xlsx/dist/index.js");

const OUT = resolve(import.meta.dir, "../test/fixtures/excel-checks");

/** Orders with a region and an amount: East 120 and 60, West 80 and 110, North 150 and 40, South 95. */
const ORDERS: Array<[string, number]> = [
  ["East", 120],
  ["West", 80],
  ["North", 150],
  ["East", 60],
  ["South", 95],
  ["West", 110],
  ["North", 40],
];

const literal = (row: number, col: number, value: string | number) => ({
  rowOffset: row,
  colOffset: col,
  value: { kind: "literal" as const, value },
});

const formula = (row: number, col: number, source: string) => ({
  rowOffset: row,
  colOffset: col,
  value: { kind: "formula" as const, src: source },
});

const columns = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    key: `c${index}`,
    header: String.fromCharCode(65 + index),
    width: 100,
    type: "text" as const,
  }));

const ordersTable: Table = {
  id: "orders",
  name: "Orders",
  range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: ORDERS.length, col: 1 } },
  columns: [
    { id: "region", name: "Region" },
    { id: "amount", name: "Amount" },
  ],
  headerRow: true,
  totalsRow: false,
};

const ordersCells = {
  startRow: 0,
  startCol: 0,
  rowCount: ORDERS.length + 1,
  colCount: 2,
  cells: [
    literal(0, 0, "Region"),
    literal(0, 1, "Amount"),
    ...ORDERS.flatMap(([region, amount], index) => [
      literal(index + 1, 0, region),
      literal(index + 1, 1, amount),
    ]),
  ],
};

const MEASURES = [
  { id: "revenue", name: "Revenue", table: "orders", formula: "=SUM(Orders[Amount])" },
  {
    id: "share",
    name: "Share",
    table: "orders",
    formula: "=[Revenue]/CALCULATE([Revenue], ALL(Orders[Region]))",
  },
];

const modelPivot = (id: string, anchorRow: number, anchorCol: number): Pivot => ({
  id,
  name: "Revenue by region",
  source: {
    model: {
      table: "orders",
      fields: [
        { table: "orders", column: "region" },
        { table: "orders", column: "amount" },
      ],
    },
  },
  anchor: { row: anchorRow, col: anchorCol },
  rows: [0],
  columns: [],
  values: [
    { field: 1, aggregation: "SUM" },
    { measure: "revenue" },
    { measure: "share", numberFormat: "0%" },
  ],
});

/** Check 10: a link with saved values, and a formula that names a book without a link. */
function linksWorkbook(): Snapshot {
  return {
    schemaVersion: 1,
    workbook: {
      activeSheet: "report",
      externalLinks: [
        {
          book: "Budget.xlsx",
          target: "Budget.xlsx",
          sheets: [
            {
              name: "Annual",
              cells: [
                { row: 9, col: 2, value: 1200 },
                { row: 10, col: 2, value: 300 },
              ],
            },
          ],
        },
      ],
    },
    sheets: [
      {
        id: "report",
        name: "Report",
        order: 0,
        rowCount: 10,
        columns: columns(2),
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 4,
            colCount: 2,
            cells: [
              literal(0, 0, "Budget C10"),
              formula(0, 1, "=[Budget.xlsx]Annual!C10"),
              literal(1, 0, "Budget C10 + C11"),
              formula(1, 1, "=SUM([Budget.xlsx]Annual!C10:C11)"),
              literal(2, 0, "Twice C10"),
              formula(2, 1, "=[Budget.xlsx]Annual!C10*2"),
              literal(3, 0, "Prices B2"),
              formula(3, 1, "=[Prices.xlsx]List!B2"),
            ],
          },
        ],
      },
    ],
  };
}

/** The linked workbook of check 10, with values that differ from the saved ones. */
function budgetWorkbook(): Snapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "annual" },
    sheets: [
      {
        id: "annual",
        name: "Annual",
        order: 0,
        rowCount: 12,
        columns: columns(3),
        cells: [
          {
            startRow: 9,
            startCol: 2,
            rowCount: 2,
            colCount: 1,
            cells: [literal(0, 0, 1500), literal(1, 0, 500)],
          },
        ],
      },
    ],
  };
}

/** Checks 11 and 12: the data sheet with the orders, a model pivot with measures, or none. */
function measuresWorkbook(withPivot: boolean): Snapshot {
  return {
    schemaVersion: 1,
    workbook: {
      activeSheet: "data",
      dataModel: { relationships: [], measures: MEASURES },
    },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 20,
        columns: columns(8),
        tables: [ordersTable],
        ...(withPivot ? { pivots: [modelPivot("by-region", 0, 3)] } : {}),
        cells: [ordersCells],
      },
    ],
  };
}

/**
 * Check 13: a dashboard with a model pivot, a region slicer that keeps three
 * regions, a KPI card and a PivotChart of the Revenue measure.
 */
function dashboardWorkbook(): Snapshot {
  const measures = measuresWorkbook(false);
  return {
    ...measures,
    sheets: [
      ...measures.sheets,
      {
        id: "dash",
        name: "Dashboard",
        order: 1,
        kind: "dashboard",
        rowCount: 0,
        columns: [],
        cells: [],
        dashboard: {
          items: [
            { id: "sales", box: { x: 0, y: 0, w: 5, h: 7 }, kind: "pivot", pivot: "by-region" },
            {
              id: "region",
              box: { x: 5, y: 0, w: 2, h: 7 },
              kind: "slicer",
              field: { table: "orders", column: "region" },
              selected: ["East", "North", "West"],
            },
            { id: "kpi", box: { x: 7, y: 0, w: 3, h: 2 }, kind: "kpi", measure: "revenue" },
            { id: "chart-item", box: { x: 0, y: 7, w: 7, h: 9 }, kind: "chart", chart: "chart" },
          ],
        },
        pivots: [modelPivot("by-region", 0, 0)],
        charts: [
          {
            id: "chart",
            kind: "column",
            title: "Revenue by region",
            anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 480, height: 288 },
            series: [],
            pivot: "by-region",
            pivotValues: [1],
          },
        ],
      },
    ],
  };
}

const warnings: Record<string, string[]> = {};

/** Export `snapshot` through a full-engine grid, as **File › Export XLSX** does. */
async function exportThroughGrid(name: string, snapshot: Snapshot): Promise<void> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = core.createGridFromSnapshot(host, snapshot);
  try {
    const messages: string[] = [];
    const bytes = await core.toXlsxWorkbook(grid, {
      onWarning: (warning) => messages.push(warning.message),
    });
    writeFileSync(resolve(OUT, name), bytes);
    warnings[name] = messages;
  } finally {
    grid.destroy();
    host.remove();
  }
}

await core.initSheetwrite(undefined, formulas);
registerXlsxBackends();
const { installCanvasTestStubs } = await import("../packages/core/dist/testing.js");
const restoreCanvas = installCanvasTestStubs();

await exportThroughGrid("links-sheetwrite-export.xlsx", linksWorkbook());
await exportThroughGrid("Budget.xlsx", budgetWorkbook());
await exportThroughGrid("measures-model-pivot.xlsx", measuresWorkbook(true));
await exportThroughGrid("measures-only-model.xlsx", measuresWorkbook(false));
await exportThroughGrid("dashboard-sheetwrite-export.xlsx", dashboardWorkbook());

restoreCanvas();
console.log(JSON.stringify(warnings, null, 2));
