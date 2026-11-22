import type {
  CellScalar,
  ChartDefinition,
  ChartKind,
  ChartRange,
  ColumnarData,
  DashboardItem,
  DocumentOp,
  Measure,
  PivotDefinition,
  Sheet,
  Workbook,
  WorkbookTable,
} from "@sheetwrite/core";

// Workbooks of the analytics benchmark (#625): charts over a large source,
// a sheet with many charts, and dashboards with KPI cards, a slicer, a
// PivotChart and a pivot over an Orders table.

/** Rows of the chart source; each series reads all of them. */
export const CHART_ROWS = 20_000;
export const CHART_DATA_SHEET = "data";
/** The source cell the edit rows change: row 6 of the first series. */
export const CHART_EDIT = { row: 5, col: 1 } as const;
const SERIES_NAMES = ["North", "South", "East", "West"] as const;

function chart_range(col: number, rows: number): ChartRange {
  return {
    sheet: CHART_DATA_SHEET,
    start: { row: 0, col },
    end: { row: rows - 1, col },
  };
}

function series_over(count: number, rows: number, first_col = 1): ChartDefinition["series"] {
  return Array.from({ length: count }, (_, index) => ({
    name: SERIES_NAMES[index % SERIES_NAMES.length] ?? "Series",
    values: chart_range(first_col + index, rows),
    categories: chart_range(0, rows),
  }));
}

/** Empty columns right of the data, where the charts sit. */
const CHART_AREA_COLUMNS = 12;

/** Data columns: a text category and one number column per series name, then the chart area. */
function chart_columns(): Sheet["columns"] {
  return [
    { key: "day", header: "Day", width: 80, type: "text" },
    ...SERIES_NAMES.map((name) => ({
      key: name.toLowerCase(),
      header: name,
      width: 80,
      type: "number" as const,
    })),
    ...Array.from({ length: CHART_AREA_COLUMNS }, (_, index) => ({
      key: `area${index}`,
      header: "",
      width: 80,
      type: "text" as const,
    })),
  ];
}

function chart_data(rows: number): ColumnarData {
  const columns: ColumnarData["columns"] = {
    day: Array.from({ length: rows }, (_, row) => `Day ${row + 1}`),
  };
  SERIES_NAMES.forEach((name, series) => {
    columns[name.toLowerCase()] = Float64Array.from(
      { length: rows },
      (_, row) => 500 + ((row * (31 + series * 7) + series * 101) % 997),
    );
  });
  return { rowCount: rows, columns };
}

/**
 * One chart of `kind` with `seriesCount` series over a 20,000-row source on
 * the same sheet, beside the data. A source this long is past
 * `MAX_CHART_POINTS`, so each series draws its first 10,000 points.
 */
export function chartWorkbook(
  kind: ChartKind,
  seriesCount: number,
): { workbook: Workbook; data: ColumnarData } {
  const chart: ChartDefinition = {
    id: "chart",
    kind,
    title: "Daily revenue",
    anchor: { row: 1, col: 6, offsetX: 0, offsetY: 0, width: 520, height: 300 },
    series: series_over(seriesCount, CHART_ROWS),
  };
  return {
    workbook: {
      activeSheet: CHART_DATA_SHEET,
      sheets: [
        {
          id: CHART_DATA_SHEET,
          name: "Data",
          rowCount: CHART_ROWS,
          columns: chart_columns(),
          charts: [chart],
        },
      ],
    },
    data: chart_data(CHART_ROWS),
  };
}

/** Rows of the scroll sheet and of each of its charts' sources. */
export const SCROLL_ROWS = 2_000;
const SCROLL_CHART_ROWS = 60;
const SCROLL_KINDS: readonly ChartKind[] = [
  "column",
  "line",
  "bar",
  "area",
  "pie",
  "scatter",
  "doughnut",
  "column",
  "line",
  "area",
];

/**
 * A sheet with `count` charts down its right side, 15 rows apart, each over
 * 60 rows of the data beside it. Scrolling it moves the charts and must not
 * redraw them.
 */
export function scrollWorkbook(count: number): { workbook: Workbook; data: ColumnarData } {
  const charts = Array.from({ length: count }, (_, index): ChartDefinition => {
    const kind = SCROLL_KINDS[index % SCROLL_KINDS.length] ?? "column";
    const round = kind === "pie" || kind === "doughnut";
    const start = index * 15;
    const series = series_over(round ? 1 : 3, SCROLL_CHART_ROWS).map((entry) => ({
      ...entry,
      values:
        entry.values === "#REF!"
          ? entry.values
          : {
              ...entry.values,
              start: { ...entry.values.start, row: start },
              end: { ...entry.values.end, row: start + SCROLL_CHART_ROWS - 1 },
            },
      categories: {
        sheet: CHART_DATA_SHEET,
        start: { row: start, col: 0 },
        end: { row: start + SCROLL_CHART_ROWS - 1, col: 0 },
      },
    }));
    return {
      id: `chart-${index}`,
      kind,
      title: `Chart ${index + 1}`,
      anchor: { row: start, col: 6, offsetX: 8, offsetY: 4, width: 360, height: 220 },
      series,
    };
  });
  return {
    workbook: {
      activeSheet: CHART_DATA_SHEET,
      sheets: [
        {
          id: CHART_DATA_SHEET,
          name: "Data",
          rowCount: SCROLL_ROWS,
          columns: chart_columns(),
          charts,
        },
      ],
    },
    data: chart_data(SCROLL_ROWS),
  };
}

// Dashboards over an Orders table.

export const ORDERS_SHEET = "orders";
export const DASHBOARD_SHEET = "dashboard";
export const REGIONS = ["Americas", "APAC", "EMEA", "LATAM"] as const;
const CHANNELS = ["Online", "Retail", "Partner"] as const;
const PRODUCTS = ["Desk lamp", "Monitor arm", "Dock", "Design suite", "Setup visit"] as const;
const MONEY = "$#,##0";
/** Rows of the dashboards showcase. */
export const SHOWCASE_ROWS = 200;
/** Rows of the large data model. */
export const MODEL_ROWS = 100_000;
/** Orders column the edit rows change. */
export const REVENUE_COL = 4;

function orders_table(rows: number): WorkbookTable {
  return {
    id: "orders",
    name: "Orders",
    range: { sheet: ORDERS_SHEET, start: { row: 0, col: 0 }, end: { row: rows, col: 4 } },
    columns: [
      { id: "order", name: "Order" },
      { id: "region", name: "Region" },
      { id: "channel", name: "Channel" },
      { id: "product", name: "Product" },
      { id: "revenue", name: "Revenue" },
    ],
    headerRow: true,
    totalsRow: false,
  };
}

/** The showcase's order rows (docs/src/showcases/scenarios/dashboards.ts). */
export function orderRow(index: number): CellScalar[] {
  const region = REGIONS[(index * 3 + Math.floor(index / 4)) % REGIONS.length] ?? REGIONS[0];
  const channel = CHANNELS[(index * 2 + Math.floor(index / 5)) % CHANNELS.length] ?? CHANNELS[0];
  const product = PRODUCTS[(index * 7) % PRODUCTS.length] ?? PRODUCTS[0];
  const revenue = 120 + ((index * 97 + index * index * 13) % 1880);
  return [`ORD-${7001 + index}`, region, channel, product, revenue];
}

function orders_sheet(rows: number): Sheet {
  return {
    id: ORDERS_SHEET,
    name: "Orders",
    rowCount: rows + 1,
    frozenRows: 1,
    columns: [104, 96, 88, 120, 104].map((width, index) => ({
      key: `c${index}`,
      header: "",
      width,
      type: index === REVENUE_COL ? ("number" as const) : ("text" as const),
    })),
    tables: [orders_table(rows)],
  };
}

/** The Orders table as columnar data: the header row, then `rows` orders. */
export function ordersData(rows: number): ColumnarData {
  const names = orders_table(rows).columns.map((column) => column.name);
  const columns: ColumnarData["columns"] = {};
  names.forEach((name, col) => {
    const values = new Array<CellScalar>(rows + 1);
    values[0] = name;
    columns[`c${col}`] = values;
  });
  for (let index = 0; index < rows; index++) {
    orderRow(index).forEach((value, col) => {
      const column = columns[`c${col}`] as CellScalar[];
      column[index + 1] = value;
    });
  }
  return { rowCount: rows + 1, columns };
}

/** The showcase's orders as the document operations it applies after the grid starts. */
export function orderOperations(rows: number): DocumentOp[] {
  const set = (row: number, col: number, value: CellScalar): DocumentOp => ({
    op: "set",
    addr: { sheet: ORDERS_SHEET, row, col },
    value: { kind: "literal", value },
  });
  const operations = orders_table(rows).columns.map((column, col) => set(0, col, column.name));
  for (let index = 0; index < rows; index++) {
    orderRow(index).forEach((value, col) => operations.push(set(index + 1, col, value)));
  }
  operations.push({
    op: "setRangeStyle",
    range: {
      sheet: ORDERS_SHEET,
      start: { row: 1, col: REVENUE_COL },
      end: { row: rows, col: REVENUE_COL },
    },
    style: { numberFormat: MONEY },
  });
  return operations;
}

function table_pivot(id: string, name: string, row_field: number): PivotDefinition {
  return {
    id,
    name,
    source: { table: "orders" },
    anchor: { row: 0, col: 0 },
    rows: [row_field],
    columns: [],
    values: [{ field: REVENUE_COL, aggregation: "SUM", name: "Revenue", numberFormat: MONEY }],
  };
}

const REGION_CHART: ChartDefinition = {
  id: "region-chart",
  kind: "column",
  title: "Revenue by region",
  legend: "none",
  pivot: "by-region",
  anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 480, height: 280 },
  series: [],
};

/**
 * The dashboards showcase: two KPI cards, two slicers, a PivotChart and a
 * pivot over 200 orders. The pivots and the orders arrive as operations
 * after the grid starts, as in the showcase; see {@link showcaseOperations}.
 */
export function showcaseWorkbook(): Workbook {
  const items: DashboardItem[] = [
    {
      id: "revenue-kpi",
      kind: "kpi",
      measure: "revenue",
      title: "Revenue",
      numberFormat: MONEY,
      box: { x: 0, y: 0, w: 3, h: 3 },
    },
    {
      id: "orders-kpi",
      kind: "kpi",
      measure: "orders",
      title: "Orders",
      numberFormat: "#,##0",
      box: { x: 3, y: 0, w: 3, h: 3 },
    },
    {
      id: "region-slicer",
      kind: "slicer",
      field: { table: "orders", column: "region" },
      title: "Region",
      box: { x: 6, y: 0, w: 3, h: 3 },
    },
    {
      id: "channel-slicer",
      kind: "slicer",
      field: { table: "orders", column: "channel" },
      title: "Channel",
      box: { x: 9, y: 0, w: 3, h: 3 },
    },
    { id: "region-chart", kind: "chart", chart: REGION_CHART.id, box: { x: 0, y: 3, w: 6, h: 6 } },
    { id: "channel-pivot", kind: "pivot", pivot: "by-channel", box: { x: 6, y: 3, w: 6, h: 6 } },
  ];
  const measures: Measure[] = [
    { id: "revenue", name: "Revenue", table: "orders", formula: "=SUM(Orders[Revenue])" },
    { id: "orders", name: "Orders", table: "orders", formula: "=COUNTA(Orders[Order])" },
  ];
  return {
    activeSheet: DASHBOARD_SHEET,
    dataModel: { relationships: [], measures },
    sheets: [
      {
        id: DASHBOARD_SHEET,
        name: "Sales dashboard",
        kind: "dashboard",
        rowCount: 0,
        columns: [],
        charts: [structuredClone(REGION_CHART)],
        dashboard: { items },
      },
      orders_sheet(SHOWCASE_ROWS),
    ],
  };
}

/** The showcase's pivots, applied after its orders. */
export function showcaseOperations(): DocumentOp[] {
  return [
    table_pivot("by-region", "Revenue by region", 1),
    table_pivot("by-channel", "Revenue by channel", 2),
    table_pivot("by-product", "Revenue by product", 3),
  ].map((pivot) => ({ op: "setPivot", sheet: DASHBOARD_SHEET, pivot }));
}

/** Measures of the model dashboard: a sum, a ratio and a share of the total. */
const MODEL_MEASURES: readonly Measure[] = [
  { id: "revenue", name: "Revenue", table: "orders", formula: "=SUM(Orders[Revenue])" },
  {
    id: "average",
    name: "Average order",
    table: "orders",
    formula: "=SUM(Orders[Revenue])/COUNTA(Orders[Order])",
  },
  {
    id: "share",
    name: "Share of all regions",
    table: "orders",
    formula: "=SUM(Orders[Revenue])/CALCULATE(SUM(Orders[Revenue]), ALL(Orders[Region]))",
  },
];

/**
 * A dashboard over `rows` orders: three KPI cards (a sum, a ratio and a
 * share of the total), a region slicer, a PivotChart and a data-model pivot
 * with a SUM and the share measure. The orders sheet is active, so the grid
 * loads the rows as columnar data; the benchmark then opens the dashboard.
 */
export function modelWorkbook(rows: number): { workbook: Workbook; data: ColumnarData } {
  const items: DashboardItem[] = [
    ...MODEL_MEASURES.map((measure, index): DashboardItem => ({
      id: `${measure.id}-kpi`,
      kind: "kpi",
      measure: measure.id,
      title: measure.name,
      numberFormat: measure.id === "share" ? "0.0%" : MONEY,
      box: { x: index * 3, y: 0, w: 3, h: 3 },
    })),
    {
      id: "region-slicer",
      kind: "slicer",
      field: { table: "orders", column: "region" },
      title: "Region",
      box: { x: 9, y: 0, w: 3, h: 3 },
    },
    { id: "region-chart", kind: "chart", chart: REGION_CHART.id, box: { x: 0, y: 3, w: 6, h: 6 } },
    { id: "channel-pivot", kind: "pivot", pivot: "by-channel", box: { x: 6, y: 3, w: 6, h: 6 } },
  ];
  const channel_pivot: PivotDefinition = {
    id: "by-channel",
    name: "Revenue by channel",
    source: {
      model: {
        table: "orders",
        fields: [
          { table: "orders", column: "channel" },
          { table: "orders", column: "revenue" },
        ],
      },
    },
    anchor: { row: 0, col: 0 },
    rows: [0],
    columns: [],
    values: [
      { field: 1, aggregation: "SUM", name: "Revenue", numberFormat: MONEY },
      { measure: "share", numberFormat: "0.0%" },
    ],
  };
  return {
    workbook: {
      activeSheet: ORDERS_SHEET,
      dataModel: { relationships: [], measures: MODEL_MEASURES.map((entry) => ({ ...entry })) },
      sheets: [
        orders_sheet(rows),
        {
          id: DASHBOARD_SHEET,
          name: "Sales dashboard",
          kind: "dashboard",
          rowCount: 0,
          columns: [],
          charts: [structuredClone(REGION_CHART)],
          pivots: [table_pivot("by-region", "Revenue by region", 1), channel_pivot],
          dashboard: { items },
        },
      ],
    },
    data: ordersData(rows),
  };
}
