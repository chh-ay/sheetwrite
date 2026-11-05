import type {
  CellScalar,
  DashboardItem,
  DocumentOp,
  Grid,
  PivotDefinition,
  Sheet,
  Workbook,
  WorkbookTable,
} from "@sheetwrite/core";

import type { LiveScenario } from "../use-live-scenario.js";
import { createListeners, mountShowcaseShell, requireApplied } from "./showcase-shell.js";

// The dashboards showcase: an Orders table on a worksheet, and a dashboard
// sheet that shows two pivots over it and two slicers on a grid of twelve
// columns. Items move and resize with the mouse or the keyboard; every change
// is one undo step, saved with the workbook.

export const DATA_SHEET = "orders";
export const DASHBOARD_SHEET = "dashboard";
export const ORDER_ROWS = 200;
const MONEY = "$#,##0";

const REGIONS = ["Americas", "APAC", "EMEA", "LATAM"] as const;
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
    values: [{ field: field("revenue"), aggregation: "SUM", name: "Revenue" }],
  };
}

const PIVOTS = [
  pivot("by-region", "Revenue by region", "region"),
  pivot("by-channel", "Revenue by channel", "channel"),
  pivot("by-product", "Revenue by product", "product"),
];

/** The items the dashboard starts with: two pivots above two slicers. */
const START_ITEMS: readonly DashboardItem[] = [
  { id: "region-pivot", kind: "pivot", pivot: "by-region", box: { x: 0, y: 0, w: 6, h: 6 } },
  { id: "channel-pivot", kind: "pivot", pivot: "by-channel", box: { x: 6, y: 0, w: 6, h: 6 } },
  {
    id: "region-slicer",
    kind: "slicer",
    field: { table: "orders", column: "region" },
    title: "Region",
    box: { x: 0, y: 6, w: 4, h: 5 },
  },
  {
    id: "channel-slicer",
    kind: "slicer",
    field: { table: "orders", column: "channel" },
    title: "Channel",
    box: { x: 4, y: 6, w: 4, h: 5 },
  },
];

/** The item "Add a product pivot" places in the free corner. */
export const PRODUCT_ITEM: DashboardItem = {
  id: "product-pivot",
  kind: "pivot",
  pivot: "by-product",
  box: { x: 8, y: 6, w: 4, h: 5 },
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
    dashboard: { items: START_ITEMS.map((item) => structuredClone(item)) },
  };
  return {
    activeSheet: DASHBOARD_SHEET,
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
  /** A slicer's kept values, or null for a pivot or a slicer that keeps every value. */
  readonly selected: string | null;
}

export interface DashboardSnapshot {
  readonly items: readonly ItemReading[];
  readonly hasProductPivot: boolean;
}

export interface DashboardScenario extends LiveScenario<DashboardSnapshot> {
  addProductPivot(): void;
  /** Swap the two pivots, as dragging one onto the other's place in two moves would. */
  swapPivots(): void;
  /** Keep only the first region in the Region slicer. */
  keepFirstRegion(): void;
  showDashboard(): void;
  undo(): void;
}

const PIVOT_NAMES = new Map(PIVOTS.map((entry) => [entry.id, entry.name]));

function itemReading(item: DashboardItem): ItemReading {
  const { x, y, w, h } = item.box;
  return {
    id: item.id,
    label:
      item.kind === "pivot"
        ? (PIVOT_NAMES.get(item.pivot) ?? item.pivot)
        : `${item.title ?? "Slicer"} slicer`,
    place: `col ${x + 1}, row ${y + 1} · ${w}×${h}`,
    selected: item.kind === "slicer" && item.selected ? item.selected.join(", ") : null,
  };
}

/** Mount the orders and the dashboard, then change its items through the public Grid API. */
export function createDashboardScenario(host: HTMLElement): DashboardScenario {
  const controller = new AbortController();
  const listeners = createListeners();
  let grid: Grid | null = null;
  let dispose = () => {};

  const items = (): DashboardItem[] =>
    grid?.store.getWorkbook().sheets.find((sheet) => sheet.id === DASHBOARD_SHEET)?.dashboard
      ?.items ?? [];
  const setItems = (changed: readonly DashboardItem[], what: string) => {
    const current = grid;
    if (!current) throw new Error("The dashboard is still loading");
    requireApplied(
      current.applyTransaction({
        patches: changed.map((item) => ({ op: "setDashboardItem", sheet: DASHBOARD_SHEET, item })),
      }),
      what,
    );
  };

  const ready = (async () => {
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
      hasProductPivot: items().some((item) => item.id === PRODUCT_ITEM.id),
    }),
    addProductPivot() {
      setItems([PRODUCT_ITEM], "The new pivot item");
    },
    swapPivots() {
      const region = items().find((item) => item.id === "region-pivot");
      const channel = items().find((item) => item.id === "channel-pivot");
      if (!region || !channel) throw new Error("Both pivots must be on the dashboard");
      // Each move must land on a free place, so the region pivot waits below
      // every item while the channel pivot takes its place: one undo step.
      const freeRow = Math.max(...items().map((item) => item.box.y + item.box.h));
      setItems(
        [
          { ...region, box: { ...region.box, y: freeRow } },
          { ...channel, box: { ...region.box } },
          { ...region, box: { ...channel.box } },
        ],
        "The swap",
      );
    },
    keepFirstRegion() {
      const slicer = items().find((item) => item.id === "region-slicer");
      if (!slicer || slicer.kind !== "slicer") throw new Error("The Region slicer is missing");
      setItems([{ ...slicer, selected: [REGIONS[0]] }], "The slicer selection");
    },
    showDashboard() {
      grid?.setActiveSheet(DASHBOARD_SHEET);
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
