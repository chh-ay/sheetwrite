import {
  createGrid,
  initSheetwrite,
  type ApplyTransactionResult,
  type Grid,
} from "@sheetwrite/core";

import { observeSiteTheme } from "../../lib/site-theme.js";
import { siteGridTheme } from "../site-grid-theme.js";

export const DATA_ROWS = 4800;
export const DATA_SHEET = "operations";
const GROUP_END = 23;
const TRACE_LIMIT = 24;
const HIDDEN_ROWS = [24, 25, 26] as const;

const COLUMN = {
  order: 0,
  region: 1,
  customer: 2,
  status: 3,
  units: 4,
  freight: 5,
  owner: 6,
} as const;

/** Ordered dispatch schema shared by the Grid and its visible labels. */
export const DATA_COLUMNS = [
  { key: "order", header: "Order ID", type: "text", width: 145 },
  { key: "region", header: "Region", type: "text", width: 120 },
  { key: "customer", header: "Customer", type: "text", width: 210 },
  { key: "status", header: "Status", type: "text", width: 120 },
  { key: "units", header: "Units", type: "number", width: 100 },
  { key: "freight", header: "Freight", type: "number", width: 110 },
  { key: "owner", header: "Owner", type: "text", width: 120 },
] as const;

const HIDDEN_COLUMNS = [COLUMN.freight, COLUMN.owner];

/** Guardrails and attempted values shared by the controls and live probes. */
export const DATA_RULES = {
  units: {
    key: "units",
    column: DATA_COLUMNS[COLUMN.units],
    rule: "A whole number from 1 to 250. The Grid rejects other values.",
    value: -5,
  },
  freight: {
    key: "freight",
    column: DATA_COLUMNS[COLUMN.freight],
    rule: "Above $200 is saved, with a warning to review it.",
    value: 350,
  },
  order: {
    key: "order",
    column: DATA_COLUMNS[COLUMN.order],
    rule: "Locked. Only a manager can change it.",
    value: "MANAGER-REVIEW",
  },
} as const;

/** Format a probe's actual attempted value for its button and event receipt. */
export function probeValue(key: ProbeKey): string {
  const { value } = DATA_RULES[key];
  return key === "freight" ? `$${value}` : String(value).replace("-", "−");
}

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

export type DataAction = "sort" | "clear" | "group" | "rows" | "columns" | "operator" | "manager";
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

/** What the Grid stored and whether the guardrail rejected or warned about the probe. */
export interface ProbeResult {
  stored: string;
  outcome: "saved" | "warned" | "rejected";
}

/** One line identifying its Grid call, event, or explicitly labeled host state. */
export interface DataEvent {
  id: number;
  text: string;
  api: string;
  tone: "info" | "ok" | "warn" | "reject";
}

/** Live Grid controls plus the host role state consulted by the protection resolver. */
export interface DataToolsScenario {
  ready: Promise<void>;
  grid(): Grid | null;
  snapshot(): DataSnapshot;
  subscribe(listener: () => void): () => void;
  filter(region: string, customer: string): void;
  run(action: DataAction): void;
  probe(key: ProbeKey): void;
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
  function readCounts() {
    if (grid) {
      state = {
        ...state,
        visible: grid.store.viewRowCount(DATA_SHEET),
        total:
          grid.store.getWorkbook().sheets.find((sheet) => sheet.id === DATA_SHEET)?.rowCount ?? 0,
        manager,
        filters: [...grid.getColumnFilters()].map(
          ([col, filter]) =>
            `${DATA_COLUMNS[col]?.header ?? col}: ${filter.kind === "values" ? filter.values.join(", ") : filter.kind === "contains" ? filter.text : filter.kind}`,
        ),
        collapsed: grid.rowGroups().some((group) => group.collapsed),
        hiddenRows: grid.hiddenRows().length,
        hiddenColumns: grid.hiddenColumns().length,
      };
    }
  }

  function refresh() {
    readCounts();
    publish();
  }

  function probe(key: ProbeKey) {
    if (!grid) return;
    const { value } = DATA_RULES[key];
    const col = COLUMN[key];
    const shown = probeValue(key);

    // Always restore event reporting, including when a transaction throws.
    probing = true;
    let result: ApplyTransactionResult;
    try {
      result = grid.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: DATA_SHEET, row: 0, col },
            value: { kind: "literal", value },
          },
        ],
      });
    } finally {
      probing = false;
    }

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
    const label = DATA_COLUMNS[col].header;

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
      probes: { ...state.probes, [key]: { stored, outcome } },
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
              columns: [...DATA_COLUMNS],
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
        range: range(COLUMN.units),
        condition: { kind: "number", integer: true, min: 1, max: 250 },
        policy: "reject",
        helpText: "Units must be an integer from 1 to 250.",
      });
      grid.setValidationRule({
        id: "freight-review",
        range: range(COLUMN.freight),
        condition: { kind: "number", min: 0, max: 200 },
        policy: "warn",
        helpText: "Freight above $200 needs review.",
      });
      grid.setProtectedRange({
        id: "order-identifiers",
        range: range(COLUMN.order),
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
      state = { ...state, ready: true, regions: grid.distinctValues(COLUMN.region).map(String) };
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
      grid.setColumnFilter(COLUMN.region, region ? { kind: "values", values: [region] } : null);
      grid.setColumnFilter(COLUMN.customer, customer ? { kind: "contains", text: customer } : null);
      readCounts();
      record(
        `Showing ${state.visible.toLocaleString()} of ${state.total.toLocaleString()} orders.`,
        "setColumnFilter",
      );
      publish();
    },
    probe(key: ProbeKey) {
      probe(key);
      refresh();
    },
    run(action: DataAction) {
      if (!grid) return;
      switch (action) {
        case "sort":
          grid.sortByMulti([
            { col: COLUMN.region, ascending: true },
            { col: COLUMN.units, ascending: false },
          ]);
          record("Sorted by region, then by units, largest first.", "sortByMulti");
          break;
        case "clear":
          grid.clearView();
          record("Cleared sort and filters. Hidden rows and groups stay as they are.", "clearView");
          break;
        case "operator":
        case "manager":
          manager = action === "manager";
          record(`Now acting as ${action}.`, "Host role state");
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
        case "rows": {
          if (state.hiddenRows > 0) grid.showRows();
          else grid.hideRows([...HIDDEN_ROWS]);
          const hiddenCount = grid.hiddenRows().length;
          record(
            hiddenCount > 0
              ? `Hid rows ${HIDDEN_ROWS[0] + 1} to ${HIDDEN_ROWS[2] + 1}.`
              : "Showed all rows.",
            hiddenCount > 0 ? "hideRows" : "showRows",
          );
          break;
        }
        case "columns": {
          if (state.hiddenColumns > 0) grid.showColumns();
          else grid.hideColumns(HIDDEN_COLUMNS);
          const hiddenCount = grid.hiddenColumns().length;
          record(
            hiddenCount > 0
              ? `Hid the ${HIDDEN_COLUMNS.map((col) => DATA_COLUMNS[col].header).join(" and ")} columns.`
              : "Showed all columns.",
            hiddenCount > 0 ? "hideColumns" : "showColumns",
          );
          break;
        }
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
