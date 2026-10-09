import type { ColumnarData, DocumentOp, Workbook } from "@sheetwrite/core";

/**
 * Shared scenario for /showcases/formulas/: a deterministic sales ledger and a
 * dashboard of live full-engine formulas over it. The route, its browser
 * contract, and the docs all read these definitions.
 */

export const ORDERS_SHEET_ID = "orders";
export const ORDERS_SHEET_NAME = "Orders";
export const ANALYSIS_SHEET_ID = "analysis";
export const ANALYSIS_SHEET_NAME = "Analysis";
export const ORDER_ROWS = 20_000;

export const REGIONS = ["Americas", "EMEA", "APAC", "LATAM"] as const;
const REGION_WEIGHTS = [0.34, 0.3, 0.24, 0.12] as const;
const REGION_CODES = ["AMER", "EMEA", "APAC", "LATAM"] as const;

const PRODUCTS = [
  { name: "Atlas desk", price: 420 },
  { name: "Beacon lamp", price: 65 },
  { name: "Cobalt chair", price: 310 },
  { name: "Delta shelf", price: 180 },
  { name: "Echo stool", price: 95 },
  { name: "Flux monitor arm", price: 140 },
  { name: "Grove planter", price: 48 },
  { name: "Halo screen", price: 260 },
] as const;

const CHANNELS = ["Online", "Retail", "Partner"] as const;
/** Channel mix per region, in the order of `REGIONS`. */
const CHANNEL_MIX = [
  [0.55, 0.3, 0.15],
  [0.4, 0.35, 0.25],
  [0.62, 0.18, 0.2],
  [0.3, 0.25, 0.45],
] as const;

/** Zero-based Orders columns; formulas below use the matching A1 letters. */
export const ORDER_COLUMNS = {
  month: 0,
  region: 1,
  product: 2,
  channel: 3,
  units: 4,
  price: 5,
  revenue: 6,
  code: 7,
} as const;

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function pick<T>(items: readonly T[], weights: readonly number[], roll: number): T {
  let total = 0;
  for (let index = 0; index < items.length; index++) {
    total += weights[index] ?? 0;
    if (roll < total) return items[index]!;
  }
  return items[items.length - 1]!;
}

export interface OrdersLedger {
  data: ColumnarData;
  units: Float64Array;
  price: Float64Array;
  region: readonly string[];
}

/** Fresh deterministic ledger: seasonality peaks in November, demand falls as price rises. */
export function buildOrdersLedger(): OrdersLedger {
  const random = seeded(2026);
  const month: string[] = new Array(ORDER_ROWS);
  const region: string[] = new Array(ORDER_ROWS);
  const product: string[] = new Array(ORDER_ROWS);
  const channel: string[] = new Array(ORDER_ROWS);
  const code: string[] = new Array(ORDER_ROWS);
  const units = new Float64Array(ORDER_ROWS);
  const price = new Float64Array(ORDER_ROWS);
  const revenue = new Float64Array(ORDER_ROWS);

  for (let row = 0; row < ORDER_ROWS; row++) {
    const monthIndex = Math.floor((row / ORDER_ROWS) * 12);
    const regionIndex = REGIONS.indexOf(pick(REGIONS, REGION_WEIGHTS, random()));
    const item = PRODUCTS[Math.floor(random() * PRODUCTS.length)]!;
    const season = 1 + 0.45 * Math.max(0, Math.cos(((monthIndex - 10) / 12) * Math.PI * 2));
    const unitPrice = Math.round(item.price * (0.82 + random() * 0.3));
    const demand = 9 * season * (150 / unitPrice) ** 0.55 * (0.6 + random() * 0.8);

    month[row] = `2026-${String(monthIndex + 1).padStart(2, "0")}`;
    region[row] = REGIONS[regionIndex]!;
    product[row] = item.name;
    channel[row] = pick(CHANNELS, CHANNEL_MIX[regionIndex]!, random());
    units[row] = Math.max(1, Math.round(demand));
    price[row] = unitPrice;
    revenue[row] = units[row]! * unitPrice;
    code[row] = `SO-${month[row]}-${String(row + 1).padStart(5, "0")}-${REGION_CODES[regionIndex]}`;
  }

  return {
    data: {
      rowCount: ORDER_ROWS,
      columns: { month, region, product, channel, units, price, revenue, code },
    },
    units,
    price,
    region,
  };
}

export function createFormulasWorkbook(): Workbook {
  return {
    activeSheet: ORDERS_SHEET_ID,
    sheets: [
      {
        id: ORDERS_SHEET_ID,
        name: ORDERS_SHEET_NAME,
        rowCount: ORDER_ROWS,
        columns: [
          { key: "month", header: "Month", width: 150, type: "text" },
          { key: "region", header: "Region", width: 150, type: "text" },
          { key: "product", header: "Product", width: 230, type: "text" },
          { key: "channel", header: "Channel", width: 150, type: "text" },
          { key: "units", header: "Units", width: 100, type: "number" },
          { key: "price", header: "Price", width: 130, type: "number", numberFormat: "$#,##0" },
          {
            key: "revenue",
            header: "Revenue",
            width: 140,
            type: "number",
            numberFormat: "$#,##0",
          },
          { key: "code", header: "Order code", width: 350, type: "text" },
        ],
      },
      {
        id: ANALYSIS_SHEET_ID,
        name: ANALYSIS_SHEET_NAME,
        rowCount: 40,
        columns: [
          { key: "a", header: "A", width: 120, type: "text" },
          { key: "b", header: "B", width: 96, type: "number", numberFormat: "#,##0" },
          { key: "c", header: "C", width: 92, type: "number", numberFormat: "#,##0" },
          { key: "d", header: "D", width: 210, type: "text" },
          { key: "e", header: "E", width: 130, type: "number", numberFormat: "#,##0" },
          { key: "f", header: "F", width: 90, type: "number", numberFormat: "#,##0" },
          { key: "g", header: "G", width: 118, type: "number", numberFormat: "#,##0" },
          { key: "h", header: "H", width: 92, type: "number", numberFormat: "#,##0" },
          { key: "i", header: "I", width: 20, type: "text" },
          { key: "j", header: "J", width: 96, type: "text" },
          { key: "k", header: "K", width: 72, type: "number", numberFormat: "#,##0.0%" },
          { key: "l", header: "L", width: 100, type: "text" },
          { key: "m", header: "M", width: 84, type: "number", numberFormat: "#,##0.00" },
        ],
      },
    ],
  };
}

const range = (letter: string) => `${ORDERS_SHEET_NAME}!${letter}1:${letter}${ORDER_ROWS}`;
const MONTH = range("A");
const REGION = range("B");
const PRODUCT = range("C");
const CHANNEL = range("D");
const UNITS = range("E");
const PRICE = range("F");
const REVENUE = range("G");
const CODE = range("H");

export type FormulaFamily =
  | "Grouping"
  | "Dynamic arrays"
  | "Statistics"
  | "Regression"
  | "LAMBDA"
  | "Text and regex"
  | "Spill references"
  | "Distributions"
  | "Finance and dates"
  | "Database";

export interface FormulaPanel {
  id: string;
  title: string;
  /** Zero-based anchor of the formula on the Analysis sheet; the title sits one row above. */
  row: number;
  col: number;
  formula: string;
  families: readonly FormulaFamily[];
  explanation: string;
}

/** The dashboard. Every panel is one formula; its result spills from the anchor. */
export const FORMULA_PANELS: readonly FormulaPanel[] = [
  {
    id: "region",
    title: "Revenue by region",
    row: 1,
    col: 0,
    formula: `=GROUPBY(${REGION},${REVENUE},SUM,0,1)`,
    families: ["Grouping"],
    explanation: "One formula groups 20,000 orders by region, sums revenue, and adds a total row.",
  },
  {
    id: "pivot",
    title: "Region × channel",
    row: 1,
    col: 3,
    formula: `=PIVOTBY(${REGION},${CHANNEL},${REVENUE},SUM,0,1,,1)`,
    families: ["Grouping"],
    explanation: "A full pivot table with row and column totals, recalculated on every edit.",
  },
  {
    id: "share",
    title: "Share of revenue",
    row: 1,
    col: 9,
    formula: `=GROUPBY(${REGION},${REVENUE},PERCENTOF,0,0)`,
    families: ["Grouping"],
    explanation: "PERCENTOF as the aggregate: each region's part of the total.",
  },
  {
    id: "top",
    title: "Top 5 products",
    row: 10,
    col: 0,
    formula: `=TAKE(GROUPBY(${PRODUCT},${REVENUE},SUM,0,0,-2),5)`,
    families: ["Grouping", "Dynamic arrays"],
    explanation: "Group, sort by revenue descending, and keep the first five rows.",
  },
  {
    id: "stats",
    title: "Order revenue statistics",
    row: 1,
    col: 11,
    formula: `=HSTACK({"Mean";"Median";"Std dev";"Skew"},VSTACK(AVERAGE(${REVENUE}),MEDIAN(${REVENUE}),STDEV.S(${REVENUE}),SKEW(${REVENUE})))`,
    families: ["Statistics", "Dynamic arrays"],
    explanation: "An array constant of labels stacked beside four statistics.",
  },
  {
    id: "big",
    title: "Largest orders",
    row: 10,
    col: 3,
    formula: `=TAKE(SORTBY(FILTER(HSTACK(${CODE},${PRODUCT},${REVENUE}),${REVENUE}>4000),FILTER(${REVENUE},${REVENUE}>4000),-1),5)`,
    families: ["Dynamic arrays"],
    explanation:
      "FILTER keeps orders over $4,000, SORTBY ranks them by revenue, and TAKE keeps five. The order code makes each row unique.",
  },
  {
    id: "best",
    title: "Best product",
    row: 10,
    col: 6,
    formula: "=TAKE(A11#,1)",
    families: ["Spill references"],
    explanation: "A11# is the whole Top 5 spill. When the ranking changes, this row follows it.",
  },
  {
    id: "elasticity",
    title: "Price elasticity",
    row: 10,
    col: 11,
    formula: `=HSTACK({"Units per $1";"Units at $0"},TRANSPOSE(LINEST(${UNITS},${PRICE})))`,
    families: ["Regression", "Dynamic arrays"],
    explanation:
      "LINEST fits units against price: the slope shows how demand falls as price rises.",
  },
  {
    id: "monthly",
    title: "Monthly revenue and running total",
    row: 18,
    col: 0,
    formula: `=LET(m,GROUPBY(${MONTH},${REVENUE},SUM,0,0),HSTACK(m,SCAN(0,CHOOSECOLS(m,2),LAMBDA(total,x,total+x))))`,
    families: ["LAMBDA", "Grouping"],
    explanation: "LET names the monthly totals; SCAN with a LAMBDA builds the running total.",
  },
  {
    id: "codes",
    title: "Region from order code",
    row: 18,
    col: 3,
    formula: `=HSTACK(TAKE(${CODE},6),MAP(TAKE(${CODE},6),LAMBDA(c,REGEXEXTRACT(c,"[A-Z]+$"))))`,
    families: ["Text and regex", "LAMBDA"],
    explanation: "MAP runs a LAMBDA over each code; REGEXEXTRACT reads the region suffix.",
  },
  {
    id: "demand",
    title: "Units to stock per order",
    row: 32,
    col: 0,
    formula: `=HSTACK({"Mean";"Std dev";"95% of orders"},VSTACK(AVERAGE(${UNITS}),STDEV.S(${UNITS}),NORM.INV(0.95,AVERAGE(${UNITS}),STDEV.S(${UNITS}))))`,
    families: ["Distributions", "Statistics"],
    explanation:
      "NORM.INV turns the mean and spread of order sizes into the stock that covers 95% of orders.",
  },
  {
    id: "money",
    title: "Value of the year",
    row: 32,
    col: 3,
    formula: `=HSTACK({"NPV at 8% annually";"March working days"},VSTACK(NPV(0.08/12,CHOOSECOLS(GROUPBY(${MONTH},${REVENUE},SUM,0,0),2)),NETWORKDAYS.INTL(DATE(2026,3,1),DATE(2026,3,31),1)))`,
    families: ["Finance and dates", "Grouping"],
    explanation:
      "NPV discounts the twelve monthly totals at 8% a year; NETWORKDAYS.INTL counts the selling days.",
  },
  {
    id: "apac",
    title: "Query the ledger",
    row: 32,
    col: 6,
    formula: `=HSTACK("APAC revenue",DSUM(VSTACK({"Region","Revenue"},HSTACK(${REGION},${REVENUE})),"Revenue",{"Region";"APAC"}))`,
    families: ["Database", "Dynamic arrays"],
    explanation:
      "DSUM reads the orders as a database table and sums revenue where the criteria table says Region = APAC.",
  },
];

/** Where the visitor's own formula goes. */
export const PLAYGROUND = { row: 18, col: 6, title: "Your formula" } as const;
export const PLAYGROUND_EXAMPLE = `=XLOOKUP("Halo screen",${PRODUCT},${REVENUE})`;

/**
 * Text that spills into a numeric Analysis column, which the Grid right-aligns
 * by default. Keep it on a left edge with the panel's own labels. `col` is the
 * text column's offset from the panel anchor; `rows` is the spill height.
 */
const LEFT_ALIGNED_TEXT: ReadonlyArray<{
  readonly panel: string;
  readonly col: number;
  readonly rows: number;
}> = [
  { panel: "big", col: 1, rows: 5 },
  { panel: "best", col: 0, rows: 1 },
  { panel: "codes", col: 1, rows: 6 },
  { panel: "apac", col: 0, rows: 1 },
];

/** Panel titles and formulas, written in one transaction after the ledger loads. */
export function formulaDashboardOps(): DocumentOp[] {
  const titles = [...FORMULA_PANELS, PLAYGROUND].map(
    (panel): DocumentOp => ({
      op: "set",
      addr: { sheet: ANALYSIS_SHEET_ID, row: panel.row - 1, col: panel.col },
      value: { kind: "literal", value: panel.title },
    }),
  );
  const styles = [...FORMULA_PANELS, PLAYGROUND].map(
    (panel): DocumentOp => ({
      op: "setRangeStyle",
      range: {
        sheet: ANALYSIS_SHEET_ID,
        start: { row: panel.row - 1, col: panel.col },
        end: { row: panel.row - 1, col: panel.col },
      },
      style: { bold: true, align: "left" },
    }),
  );
  // A spill can put text in a numeric column; keep those cells left-aligned.
  const textStyles = LEFT_ALIGNED_TEXT.flatMap((entry): DocumentOp[] => {
    const panel = FORMULA_PANELS.find((candidate) => candidate.id === entry.panel);
    if (!panel) return [];
    const col = panel.col + entry.col;
    return [
      {
        op: "setRangeStyle",
        range: {
          sheet: ANALYSIS_SHEET_ID,
          start: { row: panel.row, col },
          end: { row: panel.row + entry.rows - 1, col },
        },
        style: { align: "left" },
      },
    ];
  });
  const formulas = FORMULA_PANELS.map(
    (panel): DocumentOp => ({
      op: "set",
      addr: { sheet: ANALYSIS_SHEET_ID, row: panel.row, col: panel.col },
      value: { kind: "formula", src: panel.formula },
    }),
  );
  return [...titles, ...styles, ...textStyles, ...formulas];
}

/**
 * The live edit: +20% units on every APAC order, with revenue following.
 * Returns one transaction of exact cell writes, so undo restores it exactly.
 */
export function apacPromotionOps(ledger: OrdersLedger): DocumentOp[] {
  const ops: DocumentOp[] = [];
  for (let row = 0; row < ORDER_ROWS; row++) {
    if (ledger.region[row] !== "APAC") continue;
    const units = Math.round((ledger.units[row] ?? 0) * 1.2);
    ops.push(
      {
        op: "set",
        addr: { sheet: ORDERS_SHEET_ID, row, col: ORDER_COLUMNS.units },
        value: { kind: "literal", value: units },
      },
      {
        op: "set",
        addr: { sheet: ORDERS_SHEET_ID, row, col: ORDER_COLUMNS.revenue },
        value: { kind: "literal", value: units * (ledger.price[row] ?? 0) },
      },
    );
  }
  return ops;
}
