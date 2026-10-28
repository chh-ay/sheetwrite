import type {
  CellAddress,
  CellScalar,
  ChartDefinition,
  ChartSeries,
  ColumnarData,
  Grid,
  PivotDefinition,
  PivotResultView,
  Range,
  Workbook,
} from "@sheetwrite/core";
import { createSpreadsheetShell, type SpreadsheetShell } from "@sheetwrite/core/shell";

import { initFullEngine, whenStylesReady } from "../../lib/full-engine.js";
import { observeSiteTheme } from "../../lib/site-theme.js";
import { siteGridTheme } from "../site-grid-theme.js";
import {
  buildStoryOrders,
  DIP_REGION,
  PRICE_CHANGE_MONTH,
  STORY_COMPANY,
  type StoryOrders,
} from "./orders-story.js";

// The analysis showcase: one orders sheet, a pivot of revenue by month and
// region on a summary sheet, and a line chart that reads the pivot's output.
// An edit to an order moves the pivot, and the pivot moves the chart.

export const ORDERS_SHEET = "orders";
export const SUMMARY_SHEET = "summary";
export const PIVOT_ID = "revenue-by-month";
export const CHART_ID = "revenue-trend";

/** Orders columns in sheet order; the index of each is its pivot field index. */
const ORDER_COLUMNS = [
  { key: "order", header: "Order", width: 96, type: "text" },
  { key: "date", header: "Date", width: 104, type: "text" },
  { key: "month", header: "Month", width: 88, type: "text" },
  { key: "region", header: "Region", width: 96, type: "text" },
  { key: "product", header: "Product", width: 132, type: "text" },
  { key: "channel", header: "Channel", width: 88, type: "text" },
  { key: "account", header: "Account", width: 176, type: "text" },
  { key: "units", header: "Units", width: 72, type: "number", numberFormat: "#,##0" },
  { key: "price", header: "Unit price", width: 96, type: "number", numberFormat: "$#,##0.00" },
  { key: "revenue", header: "Revenue", width: 112, type: "number", numberFormat: "$#,##0" },
] as const;

type OrderColumnKey = (typeof ORDER_COLUMNS)[number]["key"];

const field = (key: OrderColumnKey): number =>
  ORDER_COLUMNS.findIndex((column) => column.key === key);

export const MONTH_FIELD = field("month");
export const REGION_FIELD = field("region");
export const PRODUCT_FIELD = field("product");
export const REVENUE_FIELD = field("revenue");

/** One header row above the orders. */
const HEADER_ROWS = 1;
const REVENUE_FORMAT = "$#,##0";

/** Summary columns: the pivot's labels, four regions and the total, then room for the chart. */
const SUMMARY_COLUMNS = 16;
const SUMMARY_ROWS = 40;
const SUMMARY_LABEL_WIDTH = 104;
const SUMMARY_VALUE_WIDTH = 96;

/**
 * The chart sits one column right of the pivot. 560 px shows 24 months clearly
 * and still fits beside the pivot in the workspace at a 1440 px window.
 */
const CHART_GAP_COLUMNS = 1;
const CHART_WIDTH = 560;
const CHART_HEIGHT = 340;

/** The orders as the grid's columnar data, with the header row first. */
export function ordersData(orders: StoryOrders): ColumnarData {
  const withHeader = (header: string, values: ArrayLike<CellScalar>): CellScalar[] => [
    header,
    ...Array.from(values),
  ];
  const columns: Record<OrderColumnKey, CellScalar[]> = {
    order: withHeader("Order", orders.orderId),
    date: withHeader("Date", orders.date),
    month: withHeader("Month", orders.month),
    region: withHeader("Region", orders.region),
    product: withHeader("Product", orders.product),
    channel: withHeader("Channel", orders.channel),
    account: withHeader("Account", orders.account),
    units: withHeader("Units", orders.units),
    price: withHeader("Unit price", orders.unitPrice),
    revenue: withHeader("Revenue", orders.revenue),
  };

  return { rowCount: orders.rowCount + HEADER_ROWS, columns };
}

/** Both sheets; the orders arrive as columnar data, the summary as a pivot and a chart. */
export function analysisWorkbook(orders: StoryOrders): Workbook {
  return {
    activeSheet: ORDERS_SHEET,
    sheets: [
      {
        id: ORDERS_SHEET,
        name: "Orders",
        rowCount: orders.rowCount + HEADER_ROWS,
        frozenRows: HEADER_ROWS,
        columns: ORDER_COLUMNS.map((column) => ({ ...column })),
      },
      {
        id: SUMMARY_SHEET,
        name: "Summary",
        rowCount: SUMMARY_ROWS,
        columns: Array.from({ length: SUMMARY_COLUMNS }, (_, index) => ({
          key: `c${index}`,
          header: "",
          width: index === 0 ? SUMMARY_LABEL_WIDTH : SUMMARY_VALUE_WIDTH,
          type: index === 0 ? ("text" as const) : ("number" as const),
          ...(index === 0 ? {} : { numberFormat: REVENUE_FORMAT }),
        })),
      },
    ],
  };
}

/** Revenue by month (rows) and region (columns), with totals. */
export function revenuePivot(orders: StoryOrders): PivotDefinition {
  const lastRow = orders.rowCount + HEADER_ROWS - 1;

  return {
    id: PIVOT_ID,
    name: "Revenue by month and region",
    source: {
      range: {
        sheet: ORDERS_SHEET,
        start: { row: 0, col: 0 },
        end: { row: lastRow, col: ORDER_COLUMNS.length - 1 },
      },
    },
    anchor: { row: 0, col: 0 },
    rows: [MONTH_FIELD],
    columns: [REGION_FIELD],
    values: [{ field: REVENUE_FIELD, aggregation: "SUM", name: "Revenue" }],
  };
}

/**
 * A line chart over the pivot's data cells, one series per region. It reads
 * the output that `getPivotResult` reports, without the total row and column,
 * so the chart stays right when the engine's header layout changes.
 */
export function revenueChart(pivot: PivotDefinition, result: PivotResultView): ChartDefinition {
  const { anchor, headerRows, labelCols } = result;
  // The grand-total row and column are the last of each: leave them out.
  const dataRows = result.rows - headerRows - 1;
  const dataCols = result.cols - labelCols - 1;
  const firstRow = anchor.row + headerRows;
  const lastRow = firstRow + dataRows - 1;
  // Column field labels fill the first header rows, outermost first; a value
  // caption row ("Revenue") can follow them, so the region names are not
  // simply the row above the data.
  const regionRow = anchor.row + pivot.columns.length - 1;
  const range = (startRow: number, endRow: number, col: number): Range => ({
    sheet: SUMMARY_SHEET,
    start: { row: startRow, col },
    end: { row: endRow, col },
  });
  const categories = range(firstRow, lastRow, anchor.col + labelCols - 1);
  const series: ChartSeries[] = Array.from({ length: dataCols }, (_, index) => {
    const col = anchor.col + labelCols + index;

    return {
      nameRange: range(regionRow, regionRow, col),
      values: range(firstRow, lastRow, col),
      categories,
    };
  });

  return {
    id: CHART_ID,
    kind: "line",
    title: "Monthly revenue by region",
    axes: { yTitle: "Revenue" },
    legend: "bottom",
    anchor: {
      row: anchor.row,
      col: anchor.col + result.cols + CHART_GAP_COLUMNS,
      offsetX: 0,
      offsetY: 0,
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
    },
    series,
  };
}

/** The revenue cell of the first order in the dip region's price-change month. */
export function firstDipOrder(orders: StoryOrders): CellAddress {
  for (let index = 0; index < orders.rowCount; index++) {
    if (orders.region[index] === DIP_REGION && orders.month[index] === PRICE_CHANGE_MONTH) {
      return { sheet: ORDERS_SHEET, row: index + HEADER_ROWS, col: REVENUE_FIELD };
    }
  }

  throw new Error(`The story has no ${DIP_REGION} order in ${PRICE_CHANGE_MONTH}`);
}

export interface AnalysisScenario {
  readonly ready: Promise<void>;
  grid(): Grid | null;
  /** The cell the "edit an order" step points at. */
  dipOrder(): CellAddress | null;
  dispose(): void;
}

/** Throws with the transaction's first issue, so a broken setup is visible on the page. */
function requireApplied(
  result: { status: string; issues?: ReadonlyArray<{ message: string }> },
  what: string,
) {
  if (result.status === "applied") return;

  throw new Error(`${what} failed: ${result.issues?.[0]?.message ?? result.status}`);
}

/**
 * Mount the full shell with the orders, then place the pivot and the chart on
 * the summary sheet through the public Grid API, as a host would.
 */
export function createAnalysisScenario(host: HTMLElement): AnalysisScenario {
  let shell: SpreadsheetShell | null = null;
  let dipOrder: CellAddress | null = null;
  let disposed = false;

  const ready = (async () => {
    // Pivot tables need the full engine; charts draw through the optional package.
    if (!(await initFullEngine())) return;

    const { registerChartsBackend } = await import("@sheetwrite/charts");
    registerChartsBackend();
    await whenStylesReady();
    if (disposed) return;

    const orders = buildStoryOrders();
    shell = createSpreadsheetShell(host, {
      ribbon: true,
      grid: {
        workbook: analysisWorkbook(orders),
        data: ordersData(orders),
        theme: siteGridTheme(),
        config: {},
      },
    });
    const { grid } = shell;

    const pivot = revenuePivot(orders);
    requireApplied(grid.setPivot(pivot, SUMMARY_SHEET), "The revenue pivot");
    const result = grid.getPivotResult(SUMMARY_SHEET, PIVOT_ID);
    if (result?.status !== "ok") {
      throw new Error(
        `The revenue pivot did not compute: ${result?.error ?? result?.status ?? "missing"}`,
      );
    }

    requireApplied(grid.setChart(revenueChart(pivot, result), SUMMARY_SHEET), "The revenue chart");
    dipOrder = firstDipOrder(orders);
    grid.setActiveSheet(SUMMARY_SHEET);
    // Start in the empty column between the pivot and the chart: a cell inside
    // the pivot would open its field list over the chart before the reader acts.
    grid.setSelection({
      kind: "cell",
      addr: { sheet: SUMMARY_SHEET, row: result.anchor.row, col: result.anchor.col + result.cols },
    });
  })();

  const stopTheme = observeSiteTheme(() => shell?.setTheme(siteGridTheme()));

  return {
    ready,
    grid: () => shell?.grid ?? null,
    dipOrder: () => dipOrder,
    dispose() {
      disposed = true;
      stopTheme();
      shell?.destroy();
      shell = null;
    },
  };
}

/** The company the story is about, for the page's workbook title. */
export const ANALYSIS_WORKBOOK_TITLE = `${STORY_COMPANY} / Orders 2025–2026.xlsx`;
