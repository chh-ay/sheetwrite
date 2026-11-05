import {
  formatNumber,
  type DocumentOp,
  type Grid,
  type SavedQuery,
  type Workbook,
} from "@sheetwrite/core";
import {
  createQuerySession,
  type QueryRefreshResult,
  type QuerySession,
} from "@sheetwrite/queries";

import type { LiveScenario } from "../use-live-scenario.js";
import {
  createListeners,
  mountShowcaseShell,
  pressRibbonCommand,
  requireApplied,
} from "./showcase-shell.js";

// The queries showcase: the host serves an order feed (CSV) and a region list
// (JSON) from memory. Two saved queries shape them into workbook tables, and
// formulas on the Report sheet read the refreshed table. New orders reach the
// workbook only through a refresh.

export const REPORT_SHEET = "report";
export const LARGE_SHEET = "large";
const ORDERS_SOURCE = "orders-feed";
const REGIONS_SOURCE = "regions";

/** Orders in the feed when the page opens, and how many each "new orders" press adds. */
export const FEED_START_ROWS = 2_000;
export const FEED_BATCH_ROWS = 250;
/** Orders at or above this amount go to the Large orders table. */
export const LARGE_ORDER_AMOUNT = 1_500;

const REGIONS = [
  { code: "AM", regionName: "Americas", manager: "Ana Ruiz" },
  { code: "AP", regionName: "APAC", manager: "Chen Wei" },
  { code: "EU", regionName: "EMEA", manager: "Eli Moreau" },
  { code: "LA", regionName: "LATAM", manager: "Dana Holt" },
] as const;
/** Region codes weighted so the regions carry different order volumes. */
const FEED_REGION_WEIGHTS = ["AM", "AM", "AM", "EU", "EU", "AP", "LA"] as const;
const STATUSES = ["Shipped", "Shipped", "Shipped", "Packing", "Cancelled"] as const;
const MONEY = "$#,##0";

/** One order line of the host's CSV feed; the index makes it deterministic. */
function feedLine(index: number): string {
  const region = FEED_REGION_WEIGHTS[(index * 5) % FEED_REGION_WEIGHTS.length] ?? "EU";
  const status = STATUSES[(index * 3) % STATUSES.length] ?? "Shipped";
  const amount = 40 + ((index * 389) % 2_160);
  const day = 1 + (index % 28);
  return `ORD-${10_001 + index},2026-10-${String(day).padStart(2, "0")},${region},${status},${amount}`;
}

/** Which order statuses the Region totals query keeps. */
export type StatusFilter = "shipped" | "all";

function regionTotalsQuery(statuses: StatusFilter): SavedQuery {
  return {
    id: "region-totals",
    name: "Region totals",
    source: {
      kind: "csv",
      sourceId: ORDERS_SOURCE,
      columns: [
        { id: "order", name: "Order", type: "text" },
        { id: "date", name: "Date", type: "text" },
        { id: "region", name: "Region", type: "text" },
        { id: "status", name: "Status", type: "text" },
        { id: "amount", name: "Amount", type: "number" },
      ],
    },
    steps: [
      ...(statuses === "shipped"
        ? [
            {
              kind: "filter" as const,
              predicate: {
                kind: "compare" as const,
                column: "status",
                op: "eq" as const,
                value: "Shipped",
              },
            },
          ]
        : []),
      { kind: "join", input: "regions", keys: [["region", "code"]], join: "left" },
      {
        kind: "group",
        keys: ["regionName"],
        aggregates: [
          { id: "revenue", name: "Revenue", op: "sum", column: "amount" },
          { id: "orders", name: "Orders", op: "countRows" },
        ],
      },
      // The region list's name column becomes the table's Region column.
      { kind: "rename", columns: [["regionName", "Region"]] },
    ],
    output: {
      table: "region-totals",
      tableName: "RegionTotals",
      anchor: { sheet: REPORT_SHEET, row: 0, col: 0 },
    },
  };
}

const REGIONS_QUERY: SavedQuery = {
  id: "regions",
  name: "Regions",
  source: {
    kind: "json",
    sourceId: REGIONS_SOURCE,
    columns: [
      { id: "code", name: "code", type: "text" },
      { id: "regionName", name: "regionName", type: "text" },
      { id: "manager", name: "manager", type: "text" },
    ],
  },
  steps: [],
};

const LARGE_ORDERS_QUERY: SavedQuery = {
  id: "large-orders",
  name: "Large orders",
  source: regionTotalsQuery("all").source,
  steps: [
    {
      kind: "filter",
      predicate: { kind: "compare", column: "amount", op: "gte", value: LARGE_ORDER_AMOUNT },
    },
    { kind: "select", columns: ["order", "date", "region", "amount"] },
  ],
  output: {
    table: "large-orders",
    tableName: "LargeOrders",
    anchor: { sheet: LARGE_SHEET, row: 0, col: 0 },
  },
};

/** Report formulas beside the Region totals table: they read it by its structured name. */
const REPORT_FORMULAS = [
  { label: "Total revenue", src: "=SUM(RegionTotals[Revenue])", format: MONEY },
  { label: "Orders counted", src: "=SUM(RegionTotals[Orders])", format: "#,##0" },
  { label: "Large orders", src: "=ROWS(LargeOrders[Order])", format: "#,##0" },
] as const;
const FORMULA_LABEL_COL = 4;

/** Money columns: Revenue in Region totals and Amount in Large orders. */
const MONEY_COLUMNS: Readonly<Record<string, number>> = { [REPORT_SHEET]: 1, [LARGE_SHEET]: 3 };

function queriesWorkbook(): Workbook {
  // A column format, because a refresh rewrites the table cells and their styles.
  const columns = (sheet: string, widths: readonly number[]) =>
    widths.map((width, index) => ({
      key: `c${index}`,
      header: "",
      width,
      type: "text" as const,
      ...(MONEY_COLUMNS[sheet] === index ? { numberFormat: MONEY } : {}),
    }));
  return {
    activeSheet: REPORT_SHEET,
    sheets: [
      {
        id: REPORT_SHEET,
        name: "Report",
        rowCount: 24,
        columns: columns(REPORT_SHEET, [120, 112, 88, 32, 136, 112]),
      },
      {
        id: LARGE_SHEET,
        name: "Large orders",
        rowCount: 400,
        columns: columns(LARGE_SHEET, [112, 104, 80, 104]),
      },
    ],
    queries: [REGIONS_QUERY, regionTotalsQuery("shipped"), LARGE_ORDERS_QUERY],
  };
}

function reportOperations(): DocumentOp[] {
  return REPORT_FORMULAS.flatMap((formula, row): DocumentOp[] => [
    {
      op: "set",
      addr: { sheet: REPORT_SHEET, row, col: FORMULA_LABEL_COL },
      value: { kind: "literal", value: formula.label },
    },
    {
      op: "set",
      addr: { sheet: REPORT_SHEET, row, col: FORMULA_LABEL_COL + 1 },
      value: { kind: "formula", src: formula.src },
    },
    {
      op: "setRangeStyle",
      range: {
        sheet: REPORT_SHEET,
        start: { row, col: FORMULA_LABEL_COL + 1 },
        end: { row, col: FORMULA_LABEL_COL + 1 },
      },
      style: { numberFormat: formula.format },
    },
  ]);
}

/** Why a refresh wrote nothing, with the engine's diagnostic when it has one. */
function refreshFailure(result: QueryRefreshResult): string {
  if (result.status === "failed") {
    const { code, step, column } = result.diagnostic;
    const at = [step === null ? null : `step ${step + 1}`, column].filter(Boolean).join(", ");
    return `${result.queryId} failed: ${code}${at ? ` (${at})` : ""}`;
  }
  if (result.status === "blocked") return `${result.queryId} is blocked: ${result.reason}`;
  return `Refresh All wrote nothing: ${result.status}`;
}

export interface RefreshReading {
  readonly status: QueryRefreshResult["status"];
  readonly milliseconds: number;
}

export interface QueriesSnapshot {
  readonly feedRows: number;
  /** Source loads the host served, so a reader can see that undo fetches nothing. */
  readonly fetches: number;
  readonly statuses: StatusFilter;
  /** Whether a definition changed after the last refresh, so the tables are older. */
  readonly definitionChanged: boolean;
  readonly lastRefresh: RefreshReading | null;
  readonly formulas: readonly { label: string; src: string; value: string }[];
  readonly refreshing: boolean;
}

export interface QueriesScenario extends LiveScenario<QueriesSnapshot> {
  refreshAll(): Promise<void>;
  addOrders(): void;
  setStatuses(statuses: StatusFilter): void;
  /** Open Data › Queries & Connections in the ribbon. */
  openQueriesPanel(): void;
  undo(): void;
}

/** Mount the report, connect a query session to the in-memory sources, and refresh once. */
export function createQueriesScenario(host: HTMLElement): QueriesScenario {
  const controller = new AbortController();
  const listeners = createListeners();
  const encoder = new TextEncoder();
  const feed = Array.from({ length: FEED_START_ROWS }, (_, index) => feedLine(index));
  let grid: Grid | null = null;
  let shellElement: HTMLElement | null = null;
  let session: QuerySession | null = null;
  let dispose = () => {};
  let fetches = 0;
  let statuses: StatusFilter = "shipped";
  let definitionChanged = false;
  let lastRefresh: RefreshReading | null = null;
  let refreshing = false;

  // The host's only source access: the session never fetches by itself.
  const fetchSource = async (request: { sourceId: string }) => {
    fetches += 1;
    const text =
      request.sourceId === REGIONS_SOURCE
        ? JSON.stringify(REGIONS)
        : `Order,Date,Region,Status,Amount\n${feed.join("\n")}\n`;
    return { kind: "bytes" as const, bytes: encoder.encode(text) };
  };

  const refreshAll = async () => {
    if (!session) throw new Error("The query session is still connecting");
    refreshing = true;
    listeners.notify();
    const started = performance.now();
    try {
      const result = await session.refreshAll({ signal: controller.signal });
      lastRefresh = { status: result.status, milliseconds: performance.now() - started };
      if (result.status !== "applied") throw new Error(refreshFailure(result));
      definitionChanged = false;
    } finally {
      refreshing = false;
      listeners.notify();
    }
  };

  const ready = (async () => {
    const shell = await mountShowcaseShell(
      host,
      { workbook: queriesWorkbook() },
      controller.signal,
    );
    if (!shell) return;
    grid = shell.grid;
    shellElement = shell.element;
    requireApplied(grid.applyRemoteOperations(reportOperations()), "The report formulas");
    // The query engine's WASM loads here, on the first session, never with the grid.
    session = await createQuerySession(grid, { fetchSource });
    const stopChanges = grid.on("change", () => listeners.notify());
    const connected = session;
    dispose = () => {
      stopChanges();
      connected.dispose();
      shell.dispose();
    };
    if (controller.signal.aborted) return;
    await refreshAll();
  })();

  const requireGrid = (): Grid => {
    if (!grid) throw new Error("The report is still loading");
    return grid;
  };

  return {
    ready,
    subscribe: listeners.subscribe,
    snapshot() {
      const current = grid;
      return {
        feedRows: feed.length,
        fetches,
        statuses,
        definitionChanged,
        lastRefresh,
        refreshing,
        formulas: REPORT_FORMULAS.map((formula, row) => {
          const value = current?.store.getCell({
            sheet: REPORT_SHEET,
            row,
            col: FORMULA_LABEL_COL + 1,
          }).resolved;
          return {
            label: formula.label,
            src: formula.src,
            value:
              typeof value === "number" ? formatNumber(value, formula.format) : String(value ?? ""),
          };
        }),
      };
    },
    refreshAll,
    addOrders() {
      const start = feed.length;
      for (let index = start; index < start + FEED_BATCH_ROWS; index++) feed.push(feedLine(index));
      listeners.notify();
    },
    setStatuses(next) {
      if (!session) throw new Error("The query session is still connecting");
      const result = session.define(regionTotalsQuery(next));
      if (result.status === "invalid")
        throw new Error(`The query is invalid: ${result.diagnostic.code}`);
      requireApplied(result, "The query change");
      statuses = next;
      definitionChanged = true;
      listeners.notify();
    },
    openQueriesPanel() {
      if (!shellElement) throw new Error("The report is still loading");
      pressRibbonCommand(shellElement, "Data", "queries");
    },
    undo() {
      requireGrid().undo();
    },
    dispose() {
      controller.abort();
      dispose();
      grid = null;
      session = null;
    },
  };
}
