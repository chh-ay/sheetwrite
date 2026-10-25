import { createGrid, initSheetwrite, type Grid, type MutationIssue } from "@sheetwrite/core";

import { observeSiteTheme } from "../../lib/site-theme.js";
import { siteGridTheme } from "../site-grid-theme.js";

export const DATA_ROWS = 4800;
export const DATA_SHEET = "operations";
const GROUP_END = 23;
const TRACE_LIMIT = 24;
const REGIONS = ["EMEA", "APAC", "Americas"] as const;
const STATUSES = ["Open", "Packing", "Shipped", "Held"] as const;
const CUSTOMERS = [
  "Northstar Medical",
  "Cedar Retail",
  "Northstar Labs",
  "Atlas Foods",
  "Harbor Supply",
] as const;

export function buildOperationsData() {
  const columns = {
    order: [] as string[],
    region: [] as string[],
    customer: [] as string[],
    status: [] as string[],
    units: [] as number[],
    freight: [] as number[],
    owner: [] as string[],
  };
  for (let row = 0; row < DATA_ROWS; row += 1) {
    columns.order.push(`ORD-${String(row + 10001)}`);
    columns.region.push(REGIONS[row % REGIONS.length] ?? "EMEA");
    columns.customer.push(CUSTOMERS[row % CUSTOMERS.length] ?? "Northstar Medical");
    columns.status.push(STATUSES[row % STATUSES.length] ?? "Open");
    columns.units.push(1 + ((row * 17) % 250));
    columns.freight.push(20 + ((row * 13) % 180));
    columns.owner.push(["Maya", "Leo", "Aisha", "Noah"][row % 4] ?? "Maya");
  }
  return { rowCount: DATA_ROWS, columns };
}

export type DataAction =
  | "sort"
  | "clear"
  | "reject"
  | "warn"
  | "protected"
  | "group"
  | "rows"
  | "columns"
  | "permission";
export interface DataSnapshot {
  ready: boolean;
  error: string | null;
  visible: number;
  total: number;
  regions: string[];
  filters: string[];
  collapsed: boolean;
  hiddenRows: number;
  hiddenColumns: number;
  manager: boolean;
  events: readonly string[];
  probe: string;
}

function issueText(issue: MutationIssue): string {
  return `${issue.kind} ${issue.severity}: ${issue.message}`;
}

/** Public Grid API only: every displayed count and event comes back from the live Grid. */
export interface DataToolsScenario {
  ready: Promise<void>;
  grid(): Grid | null;
  snapshot(): DataSnapshot;
  subscribe(listener: () => void): () => void;
  filter(region: string, customer: string): void;
  run(action: DataAction): void;
  dispose(): void;
}

export function createDataToolsScenario(host: HTMLElement): DataToolsScenario {
  let grid: Grid | null = null;
  let disposed = false;
  let manager = false;
  let sequence = 0;
  const listeners = new Set<() => void>();
  const unsubscribes: (() => void)[] = [];
  let state: DataSnapshot = {
    ready: false,
    error: null,
    visible: 0,
    total: DATA_ROWS,
    regions: [],
    filters: [],
    collapsed: false,
    hiddenRows: 0,
    hiddenColumns: 0,
    manager: false,
    events: [],
    probe: "No mutation attempted yet.",
  };
  const publish = () => {
    for (const listener of listeners) listener();
  };
  function record(message: string) {
    sequence += 1;
    state = {
      ...state,
      events: [`${sequence}. ${message}`, ...state.events].slice(0, TRACE_LIMIT),
    };
  }
  function refresh() {
    if (grid) {
      state = {
        ...state,
        visible: grid.store.viewRowCount(DATA_SHEET),
        total:
          grid.store.getWorkbook().sheets.find((sheet) => sheet.id === DATA_SHEET)?.rowCount ?? 0,
        manager,
        filters: [...grid.getColumnFilters()].map(
          ([col, filter]) =>
            `${col === 1 ? "Region" : "Customer"}: ${filter.kind === "values" ? filter.values.join(", ") : filter.kind === "contains" ? filter.text : filter.kind}`,
        ),
        collapsed: grid.rowGroups().some((group) => group.collapsed),
        hiddenRows: grid.hiddenRows().length,
        hiddenColumns: grid.hiddenColumns().length,
      };
    }
    publish();
  }
  function edit(col: number, value: string | number) {
    if (!grid) return;
    const result = grid.applyTransaction({
      patches: [
        { op: "set", addr: { sheet: DATA_SHEET, row: 0, col }, value: { kind: "literal", value } },
      ],
    });
    record(`API result: ${result.status}`);
    const issues =
      result.status === "rejected"
        ? result.issues
        : result.status === "applied"
          ? [...(result.warnings ?? []), ...(result.rejections ?? [])]
          : [];
    for (const issue of issues) record(issueText(issue));
    const actual = grid.store.getCell({ sheet: DATA_SHEET, row: 0, col }).resolved;
    state = {
      ...state,
      probe: `${["Order", "Region", "Customer", "Status", "Units", "Freight"][col] ?? "Cell"}: attempted ${value}; stored ${actual} (${result.status})`,
    };
  }
  const ready = initSheetwrite()
    .then(() => {
      if (disposed) return;
      grid = createGrid(host, {
        workbook: {
          activeSheet: DATA_SHEET,
          sheets: [
            {
              id: DATA_SHEET,
              name: "Dispatch operations",
              rowCount: DATA_ROWS,
              columns: [
                { key: "order", header: "Order ID", type: "text", width: 145 },
                { key: "region", header: "Region", type: "text", width: 120 },
                { key: "customer", header: "Customer", type: "text", width: 210 },
                { key: "status", header: "Status", type: "text", width: 120 },
                { key: "units", header: "Units", type: "number", width: 100 },
                { key: "freight", header: "Freight $", type: "number", width: 110 },
                { key: "owner", header: "Owner", type: "text", width: 120 },
              ],
            },
          ],
        },
        data: buildOperationsData(),
        theme: siteGridTheme(host),
        config: { toolbar: false, tabs: false },
      });
      const range = (col: number) => ({
        sheet: DATA_SHEET,
        start: { row: 0, col },
        end: { row: DATA_ROWS - 1, col },
      });
      grid.setValidationRule({
        id: "units-positive",
        range: range(4),
        condition: { kind: "number", integer: true, min: 1, max: 250 },
        policy: "reject",
        helpText: "Units must be an integer from 1 to 250.",
      });
      grid.setValidationRule({
        id: "freight-review",
        range: range(5),
        condition: { kind: "number", min: 0, max: 200 },
        policy: "warn",
        helpText: "Freight above $200 needs review.",
      });
      grid.setProtectedRange({
        id: "order-identifiers",
        range: range(0),
        label: "Order identifiers",
        permissionKey: "dispatch-manager",
      });
      grid.setProtectionResolver(({ protectedRange, operation }) => {
        // Visibility metadata does not alter the protected order identifiers.
        if (operation.op === "setRowMeta" || operation.op === "setSheetMeta") return "allow";
        return protectedRange.permissionKey === "dispatch-manager" && manager ? "allow" : "deny";
      });
      grid.groupRows(0, GROUP_END);
      unsubscribes.push(
        grid.on("change", (event) => {
          record(
            `change: ${event.source} / ${event.commitReason}; ${event.transaction.patches.length} operation(s)`,
          );
          refresh();
        }),
        grid.on("mutation-rejected", ({ issues }) => {
          record(`mutation-rejected: ${issues.map(issueText).join("; ")}`);
          refresh();
        }),
        observeSiteTheme(() => grid?.setTheme(siteGridTheme(host))),
      );
      state = { ...state, ready: true, regions: grid.distinctValues(1).map(String) };
      record("Ready: validation rules, protected order IDs and first dispatch group installed.");
      refresh();
    })
    .catch((cause: unknown) => {
      state = { ...state, error: String(cause) };
      publish();
    });

  return {
    ready,
    grid: () => grid,
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    filter(region: string, customer: string) {
      if (!grid) return;
      grid.setColumnFilter(1, region ? { kind: "values", values: [region] } : null);
      grid.setColumnFilter(2, customer ? { kind: "contains", text: customer } : null);
      record(`getColumnFilters: ${grid.getColumnFilters().size} active column(s)`);
      refresh();
    },
    run(action: DataAction) {
      if (!grid) return;
      switch (action) {
        case "sort":
          grid.sortByMulti([
            { col: 1, ascending: true },
            { col: 4, ascending: false },
          ]);
          record("sortByMulti: Region ascending → Units descending");
          break;
        case "clear":
          grid.clearView();
          record("clearView: sort and filters cleared; hidden rows stay hidden");
          break;
        case "reject":
          edit(4, -5);
          break;
        case "warn":
          edit(5, 350);
          break;
        case "protected":
          edit(0, "MANAGER-REVIEW");
          break;
        case "permission":
          manager = !manager;
          record(`Host resolver role: ${manager ? "manager" : "operator"}`);
          break;
        case "group":
          grid.setGroupCollapsed(0, !state.collapsed);
          record(`setGroupCollapsed: ${grid.rowGroups().some((group) => group.collapsed)}`);
          break;
        case "rows":
          if (state.hiddenRows > 0) grid.showRows();
          else grid.hideRows([24, 25, 26]);
          record(`Manual hidden rows: ${grid.hiddenRows().length}`);
          break;
        case "columns":
          if (grid.hiddenColumns().length > 0) grid.showColumns();
          else grid.hideColumns([5, 6]);
          record(`Hidden columns: ${grid.hiddenColumns().length}`);
          break;
      }
      refresh();
    },
    dispose() {
      disposed = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
      grid?.destroy();
      grid = null;
      listeners.clear();
    },
  };
}
