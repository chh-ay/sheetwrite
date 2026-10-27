import { createGrid, initSheetwrite, type Grid } from "@sheetwrite/core";

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
  | "operator"
  | "manager";
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
  events: readonly DataEvent[];
  probes: Readonly<Record<ProbeKey, ProbeResult | null>>;
}

/** The three guarded columns a probe can try to change. */
export type ProbeKey = "units" | "freight" | "order";

/** What the Grid did with one probe: the attempted value and what is stored now. */
export interface ProbeResult {
  attempted: string;
  stored: string;
  outcome: "saved" | "warned" | "rejected";
  message: string | null;
}

/** One log line: a plain sentence, the public call behind it, and its tone. */
export interface DataEvent {
  id: number;
  text: string;
  api: string;
  tone: "info" | "ok" | "warn" | "reject";
}

const PROBE_COLUMNS: Readonly<Record<ProbeKey, number>> = { order: 0, units: 4, freight: 5 };
const PROBE_LABELS: Readonly<Record<ProbeKey, string>> = {
  order: "Order ID",
  units: "Units",
  freight: "Freight",
};

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
    probes: { units: null, freight: null, order: null },
  };
  const publish = () => {
    for (const listener of listeners) listener();
  };
  // Probes report their own outcome; the Grid's rejection event for the same
  // write would repeat it.
  let probing = false;
  function record(text: string, api: string, tone: DataEvent["tone"] = "info") {
    sequence += 1;
    state = {
      ...state,
      events: [{ id: sequence, text, api, tone }, ...state.events].slice(0, TRACE_LIMIT),
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
  function probe(key: ProbeKey, value: string | number, shown: string) {
    if (!grid) return;
    const col = PROBE_COLUMNS[key];
    probing = true;
    const result = grid.applyTransaction({
      patches: [
        { op: "set", addr: { sheet: DATA_SHEET, row: 0, col }, value: { kind: "literal", value } },
      ],
    });
    probing = false;
    const issues =
      result.status === "rejected"
        ? result.issues
        : result.status === "applied"
          ? [...(result.warnings ?? []), ...(result.rejections ?? [])]
          : [];
    const message = issues[0]?.message ?? null;
    const outcome: ProbeResult["outcome"] =
      result.status !== "applied" ? "rejected" : issues.length > 0 ? "warned" : "saved";
    const stored = String(grid.store.getCell({ sheet: DATA_SHEET, row: 0, col }).resolved);
    const label = PROBE_LABELS[key];
    if (outcome === "rejected") {
      record(`${label} ${shown} rejected. ${message ?? ""}`.trim(), "applyTransaction", "reject");
    } else if (outcome === "warned") {
      record(
        `${label} ${shown} saved with a warning. ${message ?? ""}`.trim(),
        "applyTransaction",
        "warn",
      );
    } else {
      record(`${label} changed to ${shown}.`, "applyTransaction", "ok");
    }
    state = {
      ...state,
      probes: { ...state.probes, [key]: { attempted: shown, stored, outcome, message } },
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
          // Edits typed into the Grid; the buttons below report their own changes.
          if (event.commitReason.startsWith("edit")) {
            const count = event.transaction.patches.length;
            record(
              count === 1
                ? "You edited a cell in the Grid."
                : `You edited ${count} cells in the Grid.`,
              "change event",
              "ok",
            );
          }
          refresh();
        }),
        grid.on("mutation-rejected", ({ issues }) => {
          if (!probing) {
            const message = issues[0]?.message ?? "A rule rejected the edit.";
            record(`Edit rejected. ${message}`, "mutation-rejected event", "reject");
          }
          refresh();
        }),
        observeSiteTheme(() => grid?.setTheme(siteGridTheme(host))),
      );
      state = { ...state, ready: true, regions: grid.distinctValues(1).map(String) };
      record(
        "Rules installed: unit limits, freight review and locked order IDs.",
        "setValidationRule, setProtectedRange",
      );
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
      refresh();
      record(
        `Showing ${state.visible.toLocaleString()} of ${state.total.toLocaleString()} orders.`,
        "setColumnFilter",
      );
      publish();
    },
    run(action: DataAction) {
      if (!grid) return;
      switch (action) {
        case "sort":
          grid.sortByMulti([
            { col: 1, ascending: true },
            { col: 4, ascending: false },
          ]);
          record("Sorted by region, then by units, largest first.", "sortByMulti");
          break;
        case "clear":
          grid.clearView();
          record("Cleared sort and filters. Hidden rows and groups stay as they are.", "clearView");
          break;
        case "reject":
          probe("units", -5, "−5");
          break;
        case "warn":
          probe("freight", 350, "$350");
          break;
        case "protected":
          probe("order", "MANAGER-REVIEW", "MANAGER-REVIEW");
          break;
        case "operator":
        case "manager":
          manager = action === "manager";
          record(`Now acting as ${action}.`, "setProtectionResolver");
          break;
        case "group":
          grid.setGroupCollapsed(0, !state.collapsed);
          record(
            grid.rowGroups().some((group) => group.collapsed)
              ? "Collapsed the first dispatch batch."
              : "Expanded the first dispatch batch.",
            "setGroupCollapsed",
          );
          break;
        case "rows":
          if (state.hiddenRows > 0) grid.showRows();
          else grid.hideRows([24, 25, 26]);
          record(
            grid.hiddenRows().length > 0 ? "Hid rows 25 to 27." : "Showed all rows.",
            grid.hiddenRows().length > 0 ? "hideRows" : "showRows",
          );
          break;
        case "columns":
          if (grid.hiddenColumns().length > 0) grid.showColumns();
          else grid.hideColumns([5, 6]);
          record(
            grid.hiddenColumns().length > 0
              ? "Hid the Freight and Owner columns."
              : "Showed all columns.",
            grid.hiddenColumns().length > 0 ? "hideColumns" : "showColumns",
          );
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
