import type {
  CellBlock,
  CellScalar,
  CellStyle,
  CellValue,
  ChartDefinition,
  GridPresentation,
  PivotDefinition,
  RowMetadata,
  SavedQuery,
  SheetSnapshot,
  WorkbookSnapshot,
} from "@sheetwrite/core";

/**
 * The workbook the docs screenshots show (scripts/docs-figure-shots.ts): a
 * year of orders by month, region and product, a table of regions with their
 * managers, a data model that relates the two with revenue measures, and a
 * dashboard over it; for the formatting, analysis and formula pages, a
 * formatted regional report with a chart, a pivot of the orders with its
 * PivotChart, and a GROUPBY formula. Every value comes from fixed numbers, so
 * each capture of the same release draws the same pictures.
 */
export const FIGURE_SHEETS = {
  orders: "orders",
  regions: "regions",
  dashboard: "dashboard",
  report: "report",
  pivot: "pivot",
  formulas: "formulas",
} as const;

/**
 * The sheets only some captures open. A workbook holds them only when one of
 * them is the active sheet, so the sheet tabs of the other captures stay as
 * they were.
 */
const ANALYSIS_SHEETS: readonly string[] = [
  FIGURE_SHEETS.report,
  FIGURE_SHEETS.pivot,
  FIGURE_SHEETS.formulas,
];

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

/**
 * The Orders sheet. In the data-grid presentation the column headers name the
 * fields, so the cells start at the first order and the table has no header row.
 */
function ordersSheet(presentation: GridPresentation): SheetSnapshot {
  const rows = ordersRows();
  const headerRows = presentation === "data-grid" ? 0 : 1;
  return {
    id: FIGURE_SHEETS.orders,
    name: "Orders",
    order: 0,
    rowCount: rows.length + headerRows,
    frozenRows: headerRows,
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
          end: { row: rows.length + headerRows - 1, col: ORDER_HEADERS.length - 1 },
        },
        columns: ORDER_HEADERS.map((name) => ({ id: name.toLowerCase(), name })),
        headerRow: headerRows === 1,
        totalsRow: false,
      },
    ],
    cells: [block(headerRows === 1 ? [[...ORDER_HEADERS], ...rows] : rows)],
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

/** A report cell's value and style, before it becomes a snapshot cell. */
type ReportCell = readonly [value: CellValue, style?: CellStyle];

const formula = (src: string): CellValue => ({ kind: "formula", src });
const literal = (value: CellScalar): CellValue => ({ kind: "literal", value });

/** The statuses the report's list rule offers, and each region's status and comment. */
const REPORT_STATUS = ["On track", "At risk", "Behind"] as const;
const REPORT_NOTES: Readonly<Record<string, readonly [status: string, comment: string]>> = {
  Americas: ["At risk", "Two large desk orders moved from December to January."],
  EMEA: ["At risk", "Screen deliveries ran short in March and June."],
  APAC: ["On track", "Chairs ahead of plan; lamps flat."],
  LATAM: ["On track", "On pace since September."],
};
const HEADER_STYLE: CellStyle = {
  bold: true,
  backgroundColor: "#e6f2ec",
  border: { bottom: { color: "#1f7a4d", width: 2, style: "solid" } },
};
const TOTAL_STYLE: CellStyle = {
  bold: true,
  border: { top: { color: "#1f2937", width: 2, style: "solid" } },
};
/** The report's columns that hold numbers, right-aligned in the header as in the cells. */
const REPORT_NUMBER_COLUMNS = new Set([2, 3, 4]);

/**
 * A formatted regional report: a merged title, a styled header, revenue that
 * SUMIFS reads from the Orders table, wrapped comments, a status list, a note,
 * a total row and a column chart of revenue by region.
 */
function reportSheet(): SheetSnapshot {
  const sheet = FIGURE_SHEETS.report;
  const header = ["Region", "Manager", "Revenue", "Target", "Attainment", "Status", "Comment"];
  const rows: ReportCell[][] = [
    [[literal("Regional revenue, 2026"), { bold: true, fontSize: 18 }]],
    header.map((text, col): ReportCell => [
      literal(text),
      REPORT_NUMBER_COLUMNS.has(col) ? { ...HEADER_STYLE, align: "right" } : HEADER_STYLE,
    ]),
    ...REGIONS.map((region, index): ReportCell[] => {
      const row = index + 3;
      const [status, comment] = REPORT_NOTES[region.name] ?? ["", ""];
      return [
        [literal(region.name)],
        [literal(region.manager), { italic: true }],
        [formula(`=SUMIFS(Orders[Revenue],Orders[Region],A${row})`)],
        [literal(region.target)],
        [formula(`=C${row}/D${row}`)],
        [literal(status), { align: "center" }],
        [literal(comment), { wrap: true, verticalAlign: "top" }],
      ];
    }),
    [
      [literal("Total"), TOTAL_STYLE],
      [literal(null), TOTAL_STYLE],
      [formula("=SUM(C3:C6)"), TOTAL_STYLE],
      [formula("=SUM(D3:D6)"), TOTAL_STYLE],
      [formula("=C7/D7"), TOTAL_STYLE],
      [literal(null), TOTAL_STYLE],
      [literal(null), TOTAL_STYLE],
    ],
  ];
  return {
    id: sheet,
    name: "Report",
    order: 3,
    rowCount: 24,
    columns: [
      { key: "region", header: "Region", width: 96, type: "text" },
      { key: "manager", header: "Manager", width: 112, type: "text" },
      { key: "revenue", header: "Revenue", width: 104, type: "number", numberFormat: "$#,##0" },
      { key: "target", header: "Target", width: 104, type: "number", numberFormat: "$#,##0" },
      { key: "attainment", header: "Attainment", width: 96, type: "number", numberFormat: "0.0%" },
      { key: "status", header: "Status", width: 88, type: "text" },
      { key: "comment", header: "Comment", width: 208, type: "text" },
    ],
    rowMeta: [
      [0, { height: 44 }],
      ...REGIONS.map((_, index): [number, RowMetadata] => [index + 2, { height: 48 }]),
    ],
    merges: [{ r0: 0, c0: 0, r1: 0, c1: 6 }],
    validationRules: [
      {
        id: "status",
        range: { sheet, start: { row: 2, col: 5 }, end: { row: 5, col: 5 } },
        condition: { kind: "list", values: REPORT_STATUS },
        policy: "reject",
        helpText: "Pick a status.",
      },
    ],
    notes: [{ addr: { sheet, row: 2, col: 3 }, text: "Raised from $3,900,000 in May." }],
    charts: [
      {
        id: "revenue-by-region",
        kind: "column",
        title: "Revenue by region",
        legend: "none",
        anchor: { row: 8, col: 0, offsetX: 0, offsetY: 8, width: 520, height: 240 },
        series: [
          {
            name: "Revenue",
            values: { sheet, start: { row: 2, col: 2 }, end: { row: 5, col: 2 } },
            categories: { sheet, start: { row: 2, col: 0 }, end: { row: 5, col: 0 } },
          },
        ],
      },
    ],
    cells: [
      {
        startRow: 0,
        startCol: 0,
        rowCount: rows.length,
        colCount: header.length,
        cells: rows.flatMap((row, rowOffset) =>
          row.map(([value, style], colOffset) => ({
            rowOffset,
            colOffset,
            value,
            ...(style === undefined ? {} : { style }),
          })),
        ),
      },
    ],
  };
}

/** A pivot of the Orders table: revenue and units by region. */
const ORDERS_PIVOT: PivotDefinition = {
  id: "orders-by-region",
  name: "Orders by region",
  source: { table: "orders" },
  anchor: { row: 0, col: 0 },
  // The Orders fields: Month 0, Region 1, Product 2, Units 3, Revenue 4.
  rows: [1],
  columns: [],
  values: [
    { field: 4, aggregation: "SUM", name: "Revenue", numberFormat: "$#,##0" },
    { field: 3, aggregation: "SUM", name: "Units", numberFormat: "#,##0" },
  ],
};

/** The pivot, and a PivotChart of its revenue beside it. */
function pivotSheet(): SheetSnapshot {
  return {
    id: FIGURE_SHEETS.pivot,
    name: "Pivot",
    order: 4,
    rowCount: 40,
    columns: [
      { key: "a", header: "A", width: 120, type: "text" },
      { key: "b", header: "B", width: 112, type: "number" },
      { key: "c", header: "C", width: 88, type: "number" },
      // The PivotChart's anchor column: a chart must sit on a cell of its sheet.
      { key: "d", header: "D", width: 88, type: "text" },
    ],
    pivots: [ORDERS_PIVOT],
    charts: [
      {
        id: "orders-by-region-chart",
        kind: "column",
        title: "Revenue by region",
        legend: "none",
        anchor: { row: 0, col: 3, offsetX: 16, offsetY: 0, width: 520, height: 280 },
        series: [],
        pivot: ORDERS_PIVOT.id,
        pivotValues: [0],
      },
    ],
    cells: [],
  };
}

/** A GROUPBY that totals revenue by region from the Orders table, spilled from A1. */
function formulasSheet(): SheetSnapshot {
  return {
    id: FIGURE_SHEETS.formulas,
    name: "Formulas",
    order: 5,
    rowCount: 20,
    columns: [
      { key: "a", header: "A", width: 120, type: "text" },
      { key: "b", header: "B", width: 120, type: "number", numberFormat: "$#,##0" },
    ],
    cells: [
      {
        startRow: 0,
        startCol: 0,
        rowCount: 1,
        colCount: 1,
        cells: [
          {
            rowOffset: 0,
            colOffset: 0,
            value: formula("=GROUPBY(Orders[Region],Orders[Revenue],SUM)"),
          },
        ],
      },
    ],
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

/**
 * Where the dashboard's items sit: the full layout; the tablet layout, the
 * KPI cards in a column beside the chart; or the phone layout, one column.
 * The narrow layouts keep the Region slicer, as a strip on top, so their
 * numbers are the desktop's.
 */
export type DashboardLayout = "wide" | "tablet" | "phone";

type Box = { x: number; y: number; w: number; h: number };

/** The boxes of the narrow layouts, by item ID; they show only these items. */
const NARROW_BOXES: Readonly<Record<"tablet" | "phone", Readonly<Record<string, Box>>>> = {
  tablet: {
    region: { x: 0, y: 0, w: 12, h: 2 },
    revenue: { x: 0, y: 2, w: 5, h: 3 },
    units: { x: 0, y: 5, w: 5, h: 3 },
    target: { x: 0, y: 8, w: 5, h: 3 },
    chart: { x: 5, y: 2, w: 7, h: 9 },
  },
  phone: {
    region: { x: 0, y: 0, w: 12, h: 2 },
    revenue: { x: 0, y: 2, w: 12, h: 3 },
    units: { x: 0, y: 5, w: 6, h: 3 },
    target: { x: 6, y: 5, w: 6, h: 3 },
    chart: { x: 0, y: 8, w: 12, h: 6 },
  },
};

function narrowLayout(sheet: SheetSnapshot, layout: "tablet" | "phone"): SheetSnapshot {
  const boxes = NARROW_BOXES[layout];
  const items = (sheet.dashboard?.items ?? []).flatMap((item) => {
    const box = boxes[item.id];
    return box === undefined ? [] : [{ ...item, box }];
  });
  return { ...sheet, dashboard: { items } };
}

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
          title: "Target",
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

/**
 * The screenshot workbook, opened on `activeSheet`, with the dashboard in
 * `layout` and Orders laid out for `presentation`.
 */
export function figureWorkbook(
  activeSheet: string = FIGURE_SHEETS.dashboard,
  layout: DashboardLayout = "wide",
  presentation: GridPresentation = "spreadsheet",
): WorkbookSnapshot {
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
    sheets: [
      ordersSheet(presentation),
      regionsSheet(),
      layout === "wide" ? dashboardSheet() : narrowLayout(dashboardSheet(), layout),
      ...(ANALYSIS_SHEETS.includes(activeSheet)
        ? [reportSheet(), pivotSheet(), formulasSheet()]
        : []),
    ],
  };
}
