import type {
 CellScalar,
 ChartDefinition,
 DashboardItem,
 DocumentOp,
 Grid,
 Measure,
 PivotDefinition,
 Sheet,
 Workbook,
 WorkbookTable,
} from "@sheetwrite/core";

import type { LiveScenario } from "../use-live-scenario.js";
import { createListeners, mountShowcaseShell, requireApplied } from "./showcase-shell.js";

// The dashboards showcase: an Orders table on a worksheet, and a dashboard
// sheet on a grid of twelve columns with two KPI cards, two slicers, a
// PivotChart and a pivot. The slicers filter the pivot, the chart and the KPI
// cards together. Items move and resize with the mouse or the keyboard; every
// change is one undo step, saved with the workbook.

export const DATA_SHEET = "orders";
export const DASHBOARD_SHEET = "dashboard";
export const ORDER_ROWS = 200;
const MONEY = "$#,##0";

export const REGIONS = ["Americas", "APAC", "EMEA", "LATAM"] as const;
const CHANNELS = ["Online", "Retail", "Partner"] as const;
const PRODUCTS = ["Desk lamp", "Monitor arm", "Dock", "Design suite", "Setup visit"] as const;

const ORDERS_TABLE: WorkbookTable = {
 id: "orders",
 name: "Orders",
 range: { sheet: DATA_SHEET, start: { row: 0, col: 0 }, end: { row: ORDER_ROWS, col: 4 } },
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

/** The column index of an Orders field, which is its pivot field index. */
const field = (id: string) => ORDERS_TABLE.columns.findIndex((column) => column.id === id);

function pivot(id: string, name: string, rowField: string): PivotDefinition {
 return {
  id,
  name,
  source: { table: ORDERS_TABLE.id },
  anchor: { row: 0, col: 0 },
  rows: [field(rowField)],
  columns: [],
  values: [
   { field: field("revenue"), aggregation: "SUM", name: "Revenue", numberFormat: MONEY },
  ],
 };
}

const CHANNEL_PIVOT = "by-channel";
const PIVOTS = [
 pivot("by-region", "Revenue by region", "region"),
 pivot(CHANNEL_PIVOT, "Revenue by channel", "channel"),
 pivot("by-product", "Revenue by product", "product"),
];

/** Measures the KPI cards show, recalculated in the slicers' filter context. */
const MEASURES: readonly Measure[] = [
 { id: "revenue", name: "Revenue", table: "orders", formula: "=SUM(Orders[Revenue])" },
 { id: "orders", name: "Orders", table: "orders", formula: "=COUNTA(Orders[Order])" },
];

/**
 * A PivotChart: its categories and series come from the pivot, so it lists no
 * series. The item's header names it, so the chart draws no title.
 */
const REGION_CHART: ChartDefinition = {
 id: "region-chart",
 kind: "column",
 legend: "none",
 pivot: "by-region",
 anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 480, height: 280 },
 series: [],
};

/** The items the dashboard starts with: KPI cards and slicers above a chart and a pivot. */
const START_ITEMS: readonly DashboardItem[] = [
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
 { id: "channel-pivot", kind: "pivot", pivot: CHANNEL_PIVOT, box: { x: 6, y: 3, w: 6, h: 6 } },
];

/** The item "Add a product pivot" places in the free row under the others. */
export const PRODUCT_ITEM: DashboardItem = {
 id: "product-pivot",
 kind: "pivot",
 pivot: "by-product",
 box: { x: 0, y: 9, w: 6, h: 5 },
};

function orderRow(index: number): CellScalar[] {
 const region = REGIONS[(index * 3 + Math.floor(index / 4)) % REGIONS.length] ?? REGIONS[0];
 const channel = CHANNELS[(index * 2 + Math.floor(index / 5)) % CHANNELS.length] ?? CHANNELS[0];
 const product = PRODUCTS[(index * 7) % PRODUCTS.length] ?? PRODUCTS[0];
 // The squared term keeps the regions and channels from ending on equal totals.
 const revenue = 120 + ((index * 97 + index * index * 13) % 1880);
 return [`ORD-${7001 + index}`, region, channel, product, revenue];
}

function orderOperations(): DocumentOp[] {
 const set = (row: number, col: number, value: CellScalar): DocumentOp => ({
  op: "set",
  addr: { sheet: DATA_SHEET, row, col },
  value: { kind: "literal", value },
 });
 const operations = ORDERS_TABLE.columns.map((column, col) => set(0, col, column.name));
 for (let index = 0; index < ORDER_ROWS; index++) {
  orderRow(index).forEach((value, col) => operations.push(set(index + 1, col, value)));
 }
 operations.push({
  op: "setRangeStyle",
  range: {
   sheet: DATA_SHEET,
   start: { row: 1, col: field("revenue") },
   end: { row: ORDER_ROWS, col: field("revenue") },
  },
  style: { numberFormat: MONEY },
 });
 return operations;
}

function dashboardWorkbook(): Workbook {
 const dashboard: Sheet = {
  id: DASHBOARD_SHEET,
  name: "Sales dashboard",
  kind: "dashboard",
  rowCount: 0,
  columns: [],
  charts: [structuredClone(REGION_CHART)],
  dashboard: { items: START_ITEMS.map((item) => structuredClone(item)) },
 };
 return {
  activeSheet: DASHBOARD_SHEET,
  dataModel: { relationships: [], measures: MEASURES.map((measure) => ({ ...measure })) },
  sheets: [
   dashboard,
   {
    id: DATA_SHEET,
    name: "Orders",
    rowCount: ORDER_ROWS + 1,
    frozenRows: 1,
    columns: [104, 96, 88, 120, 104].map((width, index) => ({
     key: `c${index}`,
     header: "",
     width,
     type: "text" as const,
    })),
    tables: [ORDERS_TABLE],
   },
  ],
 };
}

export interface ItemReading {
 readonly id: string;
 readonly label: string;
 readonly place: string;
 /** A slicer's kept values, or null for another item or a slicer that keeps every value. */
 readonly selected: string | null;
}

export interface DashboardSnapshot {
 readonly items: readonly ItemReading[];
 readonly hasProductPivot: boolean;
 /** The grand total of the channel pivot, in the slicers' filter context. */
 readonly filteredRevenue: CellScalar;
}

export interface DashboardScenario extends LiveScenario<DashboardSnapshot> {
 addProductPivot(): void;
 /** Swap the chart and the pivot, as two drags through a free place would. */
 swapChartAndPivot(): void;
 /** Keep only the first region in the Region slicer. */
 keepFirstRegion(): void;
 undo(): void;
}

const PIVOT_NAMES = new Map(PIVOTS.map((entry) => [entry.id, entry.name]));

function itemLabel(item: DashboardItem): string {
 switch (item.kind) {
  case "pivot":
   return PIVOT_NAMES.get(item.pivot) ?? item.pivot;
  case "slicer":
   return `${item.title ?? "Slicer"} slicer`;
  case "kpi":
   return `${item.title ?? item.measure} card`;
  case "chart":
   return `${PIVOT_NAMES.get(REGION_CHART.pivot ?? "") ?? item.chart} chart`;
 }
}

function itemReading(item: DashboardItem): ItemReading {
 const { x, y, w, h } = item.box;
 return {
  id: item.id,
  label: itemLabel(item),
  place: `col ${x + 1}, row ${y + 1} · ${w}×${h}`,
  selected: item.kind === "slicer" && item.selected ? item.selected.join(", ") : null,
 };
}

/** The bottom-right cell of a pivot result: its grand total. */
function grandTotal(grid: Grid): CellScalar {
 const result = grid.getPivotResult(DASHBOARD_SHEET, CHANNEL_PIVOT);
 if (result?.status !== "ok") return null;
 return result.cells[result.rows * result.cols - 1] ?? null;
}

/** Mount the orders and the dashboard, then change its items through the public Grid API. */
export function createDashboardScenario(host: HTMLElement): DashboardScenario {
 const controller = new AbortController();
 const listeners = createListeners();
 let grid: Grid | null = null;
 let dispose = () => { };

 const items = (): DashboardItem[] =>
  grid?.store.getWorkbook().sheets.find((sheet) => sheet.id === DASHBOARD_SHEET)?.dashboard
   ?.items ?? [];
 const item = (id: string): DashboardItem => {
  const found = items().find((candidate) => candidate.id === id);
  if (!found) throw new Error(`The dashboard has no ${id} item`);
  return found;
 };
 const setItems = (changed: readonly DashboardItem[], what: string) => {
  const current = grid;
  if (!current) throw new Error("The dashboard is still loading");
  requireApplied(
   current.applyTransaction({
    patches: changed.map((next) => ({
     op: "setDashboardItem",
     sheet: DASHBOARD_SHEET,
     item: next,
    })),
   }),
   what,
  );
 };

 const ready = (async () => {
  // The PivotChart draws through the optional charts package.
  const { registerChartsBackend } = await import("@sheetwrite/charts");
  registerChartsBackend();
  const shell = await mountShowcaseShell(
   host,
   { workbook: dashboardWorkbook() },
   controller.signal,
  );
  if (!shell) return;
  grid = shell.grid;
  requireApplied(grid.applyRemoteOperations(orderOperations()), "The orders");
  requireApplied(
   grid.applyRemoteOperations(
    PIVOTS.map((definition) => ({ op: "setPivot", sheet: DASHBOARD_SHEET, pivot: definition })),
   ),
   "The dashboard pivots",
  );
  listeners.notify();
  const stopChanges = grid.on("change", () => listeners.notify());
  dispose = () => {
   stopChanges();
   shell.dispose();
  };
 })();

 return {
  ready,
  subscribe: listeners.subscribe,
  snapshot: () => ({
   items: items().map(itemReading),
   hasProductPivot: items().some((candidate) => candidate.id === PRODUCT_ITEM.id),
   filteredRevenue: grid ? grandTotal(grid) : null,
  }),
  addProductPivot() {
   setItems([PRODUCT_ITEM], "The new pivot item");
  },
  swapChartAndPivot() {
   const chart = item("region-chart");
   const table = item("channel-pivot");
   // Each move must land on a free place, so the chart waits below every
   // item while the pivot takes its place: one undo step.
   const freeRow = Math.max(...items().map((candidate) => candidate.box.y + candidate.box.h));
   setItems(
    [
     { ...chart, box: { ...chart.box, y: freeRow } },
     { ...table, box: { ...chart.box } },
     { ...chart, box: { ...table.box } },
    ],
    "The swap",
   );
  },
  keepFirstRegion() {
   const slicer = item("region-slicer");
   if (slicer.kind !== "slicer") throw new Error("The Region slicer is missing");
   setItems([{ ...slicer, selected: [REGIONS[0]] }], "The slicer selection");
  },
  undo() {
   grid?.undo();
  },
  dispose() {
   controller.abort();
   dispose();
   grid = null;
  },
 };
}
