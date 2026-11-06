import type {
  CellBlock,
  ChartDefinition,
  CellScalar,
  PivotDefinition,
  SavedQuery,
  SheetSnapshot,
  WorkbookSnapshot,
} from "@sheetwrite/core";

/**
 * The workbook the docs screenshots show (scripts/docs-figure-shots.ts): a
 * year of orders by month, region and product, a table of regions with their
 * managers, a data model that relates the two with revenue measures, and a
 * dashboard over it. Every value comes from fixed numbers, so each capture of
 * the same release draws the same pictures.
 */
export const FIGURE_SHEETS = {
  orders: "orders",
  regions: "regions",
  dashboard: "dashboard",
} as const;

const REGIONS = [
  { name: "Americas", manager: "Avery Brooks", target: 4_200_000, weight: 1.32 },
  { name: "EMEA", manager: "Lena Fischer", target: 3_300_000, weight: 1.04 },
  { name: "APAC", manager: "Kenji Mori", target: 2_900_000, weight: 0.91 },
  { name: "LATAM", manager: "Sofía Ruiz", target: 1_600_000, weight: 0.52 },
] as const;

const PRODUCTS = [
  { name: "Ledger desk", price: 640 },
  { name: "Halo screen", price: 410 },
  { name: "Tally chair", price: 290 },
  { name: "Quill lamp", price: 85 },
] as const;

const MONTHS = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12",
] as const;

/** Demand by month: a spring lull and the fourth-quarter peak. */
const SEASON = [0.86, 0.82, 0.94, 0.9, 0.84, 0.8, 0.88, 0.93, 1.02, 1.12, 1.24, 1.36] as const;

/** Units of one product in one region and month; a fixed spread, no randomness. */
function units(regionIndex: number, productIndex: number, monthIndex: number): number {
  const region = REGIONS[regionIndex]!;
  const spread = 1 + ((regionIndex * 7 + productIndex * 5 + monthIndex * 3) % 9) / 40;
  const base = [120, 160, 210, 420][productIndex]!;
  return Math.round(base * region.weight * SEASON[monthIndex]! * spread);
}

const ORDER_HEADERS = ["Month", "Region", "Product", "Units", "Revenue"] as const;

function ordersRows(): CellScalar[][] {
  const rows: CellScalar[][] = [];
  for (const [monthIndex, month] of MONTHS.entries())
    for (const [regionIndex, region] of REGIONS.entries())
      for (const [productIndex, product] of PRODUCTS.entries()) {
        const count = units(regionIndex, productIndex, monthIndex);
        rows.push([month, region.name, product.name, count, count * product.price]);
      }
  return rows;
}

/** One block of rows from A1, header first. */
function block(rows: readonly (readonly CellScalar[])[]): CellBlock {
  return {
    startRow: 0,
    startCol: 0,
    rowCount: rows.length,
    colCount: rows[0]?.length ?? 0,
    cells: rows.flatMap((row, rowOffset) =>
      row.map((value, colOffset) => ({ rowOffset, colOffset, value: { kind: "literal", value } })),
    ),
  };
}

function ordersSheet(): SheetSnapshot {
  const rows = ordersRows();
  return {
    id: FIGURE_SHEETS.orders,
    name: "Orders",
    order: 0,
    rowCount: rows.length + 1,
    frozenRows: 1,
    columns: [
      { key: "month", header: "Month", width: 96, type: "text" },
      { key: "region", header: "Region", width: 104, type: "text" },
      { key: "product", header: "Product", width: 128, type: "text" },
      { key: "units", header: "Units", width: 80, type: "number", numberFormat: "#,##0" },
      { key: "revenue", header: "Revenue", width: 112, type: "number", numberFormat: "$#,##0" },
    ],
    tables: [
      {
        id: "orders",
        name: "Orders",
        range: {
          sheet: FIGURE_SHEETS.orders,
          start: { row: 0, col: 0 },
          end: { row: rows.length, col: ORDER_HEADERS.length - 1 },
        },
        columns: ORDER_HEADERS.map((name) => ({ id: name.toLowerCase(), name })),
        headerRow: true,
        totalsRow: false,
      },
    ],
    cells: [block([[...ORDER_HEADERS], ...rows])],
  };
}

function regionsSheet(): SheetSnapshot {
  const rows: CellScalar[][] = [
    ["Region", "Manager", "Target"],
    ...REGIONS.map((region) => [region.name, region.manager, region.target]),
  ];
  return {
    id: FIGURE_SHEETS.regions,
    name: "Regions",
    order: 1,
    rowCount: rows.length,
    columns: [
      { key: "region", header: "Region", width: 104, type: "text" },
      { key: "manager", header: "Manager", width: 136, type: "text" },
      { key: "target", header: "Target", width: 112, type: "number", numberFormat: "$#,##0" },
    ],
    tables: [
      {
        id: "regions",
        name: "Regions",
        range: {
          sheet: FIGURE_SHEETS.regions,
          start: { row: 0, col: 0 },
          end: { row: REGIONS.length, col: 2 },
        },
        columns: [
          { id: "region", name: "Region" },
          { id: "manager", name: "Manager" },
          { id: "target", name: "Target" },
        ],
        headerRow: true,
        totalsRow: false,
      },
    ],
    cells: [block(rows)],
  };
}

/** The model fields the dashboard pivots group by; a pivot's rows index into this list. */
const MODEL_SOURCE = {
  model: {
    table: "orders",
    fields: [
      { table: "orders", column: "month" },
      { table: "orders", column: "product" },
      { table: "regions", column: "region" },
    ],
  },
};
const FIELD = { month: 0, product: 1, region: 2 } as const;

const BY_PRODUCT: PivotDefinition = {
  id: "by-product",
  name: "Revenue by product",
  source: MODEL_SOURCE,
  anchor: { row: 0, col: 0 },
  rows: [FIELD.product],
  columns: [],
  values: [
    { measure: "revenue", numberFormat: "$#,##0" },
    { measure: "share", numberFormat: "0.0%" },
  ],
};

const BY_MONTH: PivotDefinition = {
  id: "by-month",
  name: "Revenue by month",
  source: MODEL_SOURCE,
  anchor: { row: 0, col: 0 },
  rows: [FIELD.month],
  columns: [],
  values: [{ measure: "revenue", numberFormat: "$#,##0" }],
};

const MONTHLY_CHART: ChartDefinition = {
  id: "monthly-revenue",
  kind: "column",
  title: "Revenue by month",
  legend: "none",
  anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 480, height: 240 },
  series: [],
  pivot: BY_MONTH.id,
};

function dashboardSheet(): SheetSnapshot {
  return {
    id: FIGURE_SHEETS.dashboard,
    name: "Dashboard",
    order: 2,
    kind: "dashboard",
    rowCount: 0,
    columns: [],
    pivots: [BY_PRODUCT, BY_MONTH],
    charts: [MONTHLY_CHART],
    dashboard: {
      items: [
        {
          id: "revenue",
          box: { x: 0, y: 0, w: 4, h: 3 },
          kind: "kpi",
          measure: "revenue",
          title: "Revenue",
          numberFormat: "$#,##0",
        },
        {
          id: "units",
          box: { x: 4, y: 0, w: 3, h: 3 },
          kind: "kpi",
          measure: "units",
          title: "Units sold",
          numberFormat: "#,##0",
        },
        {
          id: "target",
          box: { x: 7, y: 0, w: 2, h: 3 },
          kind: "kpi",
          measure: "attainment",
          title: "Attainment",
          numberFormat: "0%",
        },
        {
          id: "region",
          box: { x: 9, y: 0, w: 3, h: 3 },
          kind: "slicer",
          field: { table: "regions", column: "region" },
          selected: ["Americas", "EMEA"],
          title: "Region",
        },
        { id: "chart", box: { x: 0, y: 3, w: 7, h: 6 }, kind: "chart", chart: MONTHLY_CHART.id },
        { id: "products", box: { x: 7, y: 3, w: 5, h: 6 }, kind: "pivot", pivot: BY_PRODUCT.id },
      ],
    },
    cells: [],
  };
}

/** Two saved queries for the Queries & Connections capture; the stage serves their sources. */
const SAVED_QUERIES: SavedQuery[] = [
  {
    id: "targets",
    name: "Regional targets",
    source: {
      kind: "csv",
      sourceId: "targets",
      columns: [
        { id: "region", name: "Region", type: "text" },
        { id: "target", name: "Target", type: "number" },
      ],
    },
    steps: [
      { kind: "filter", predicate: { kind: "compare", column: "target", op: "gt", value: 0 } },
    ],
  },
  {
    id: "rates",
    name: "Exchange rates",
    source: {
      kind: "json",
      sourceId: "rates",
      columns: [
        { id: "currency", name: "Currency", type: "text" },
        { id: "rate", name: "Rate", type: "number" },
      ],
      path: ["rates"],
    },
    steps: [{ kind: "select", columns: ["currency", "rate"] }],
  },
];

/** The screenshot workbook, opened on `activeSheet`. */
export function figureWorkbook(activeSheet: string = FIGURE_SHEETS.dashboard): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: {
      activeSheet,
      queries: SAVED_QUERIES,
      dataModel: {
        relationships: [
          {
            id: "orders-regions",
            from: { table: "orders", column: "region" },
            to: { table: "regions", column: "region" },
          },
        ],
        measures: [
          { id: "revenue", name: "Revenue", table: "orders", formula: "=SUM(Orders[Revenue])" },
          { id: "units", name: "Units", table: "orders", formula: "=SUM(Orders[Units])" },
          {
            id: "share",
            name: "Share",
            table: "orders",
            formula: "=[Revenue]/CALCULATE([Revenue],ALL(Orders[Product]))",
          },
          {
            id: "attainment",
            name: "Attainment",
            table: "orders",
            formula: "=[Revenue]/SUM(Regions[Target])",
          },
        ],
      },
    },
    sheets: [ordersSheet(), regionsSheet(), dashboardSheet()],
  };
}
