// The host rows demo's engine: the accounts grid with its row bridge, loaded
// once the grid comes near the viewport (HostRowsStage.tsx).
import "@sheetwrite/core/styles.css";
import { observeSiteTheme } from "@docs/lib/site-theme.js";
import { revenueAccountName } from "@docs/showcases/revenue.js";
import { siteGridTheme } from "@docs/showcases/site-grid-theme.js";
import {
  createRowBridge,
  type DocumentOp,
  type Grid,
  type GridConfig,
  initSheetwrite,
  type RowBridgeProjection,
} from "@sheetwrite/core";
import { createGridController, createSimpleGridInput } from "@sheetwrite/core/adapter";

import {
  ACCOUNT_COLUMNS,
  INITIAL_ACCOUNTS,
  LEAD_IMPORT_ROWS,
  LEAD_LOAD_BATCH_ROWS,
  OWNERS,
  REGIONS,
  REQUESTED_OPERATIONS,
  SERVER_NORMALIZED_OPERATIONS,
} from "./accounts.js";

const GRID_CONFIG: GridConfig = {
  contextMenu: [
    { action: "copy", label: "Copy account value" },
    { action: "paste" },
    { action: "separator" },
    { action: "exportCsv", label: "Export host accounts" },
  ],
};
const ROW_HEIGHT = 36;

interface AccountsHandlers {
  /** Each edit, insert and delete, as deltas that name account IDs. */
  readonly onProjection: (projection: RowBridgeProjection<string>) => void;
}

export interface ImportTiming {
  readonly insertMs: number;
  readonly loadMs: number;
  readonly batches: number;
}

export interface AccountsGrid {
  readonly grid: Grid;
  /** The next edit is denied by the host's write policy. */
  rejectNextEdit(): void;
  /** The server stores the requested ARR rounded, and the host hears it once. */
  transformedAccept(): void;
  /** Appends the leads after `startRow`: one insert commit, then batched cell loads. */
  importLeads(startRow: number): ImportTiming;
  dispose(): void;
}

/** Mounts the accounts grid in `host` with a row bridge that names each account. */
export async function startAccountsGrid(
  host: HTMLElement,
  handlers: AccountsHandlers,
): Promise<AccountsGrid> {
  await initSheetwrite();
  let next_id = INITIAL_ACCOUNTS.length + 1;
  let deny_next = false;
  let server_responses = 0;
  let applying_server_result = false;

  const input = createSimpleGridInput({
    columns: ACCOUNT_COLUMNS,
    defaultRows: INITIAL_ACCOUNTS,
    sheetName: "Accounts",
  });
  const sheet = input.workbook.sheets[0];
  if (!sheet) throw new Error("The account workbook has no sheet.");
  sheet.protectedRanges = [
    {
      id: "host-check",
      range: {
        sheet: "sheet1",
        start: { row: 0, col: 0 },
        end: { row: INITIAL_ACCOUNTS.length - 1, col: ACCOUNT_COLUMNS.length - 1 },
      },
    },
  ];
  const bridge = createRowBridge({
    columns: ACCOUNT_COLUMNS,
    defaultRows: INITIAL_ACCOUNTS,
    getRowId: (row) => row.id,
    createRowId: () => `account-${String(next_id++).padStart(3, "0")}`,
  });

  const controller = createGridController(
    host,
    {
      ...input,
      theme: { ...siteGridTheme(host), rowHeight: ROW_HEIGHT },
      config: GRID_CONFIG,
      protectionResolver: () => {
        if (!deny_next) return "allow";
        deny_next = false;
        return "deny";
      },
    },
    {
      onRowDelta: (projection) => {
        if (!applying_server_result) handlers.onProjection(projection);
      },
      onMutationRejected: () =>
        handlers.onProjection(
          bridge.reconcile({
            status: "rejected",
            transactionId: "rejected-showcase",
            operations: [],
          }),
        ),
    },
    bridge,
  );
  const grid = controller.grid;
  // The grid paints with resolved colors, so it re-reads the site tokens when
  // the page theme changes.
  const stop_theme = observeSiteTheme(() =>
    controller.setTheme({ ...siteGridTheme(host), rowHeight: ROW_HEIGHT }),
  );

  return {
    grid,
    rejectNextEdit() {
      deny_next = true;
      grid.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "sheet1", row: 0, col: 1 },
            value: { kind: "literal", value: 999 },
          },
        ],
      });
    },
    transformedAccept() {
      // The server accepts the host's request in a normalized form. The Grid
      // must show the stored result, so apply it first and report it to the
      // host once, as the transformed acceptance, not also as a remote change.
      applying_server_result = true;
      let applied = false;
      try {
        applied = grid.applyRemoteOperations(SERVER_NORMALIZED_OPERATIONS).status === "applied";
      } finally {
        applying_server_result = false;
      }
      if (!applied) return;
      handlers.onProjection(
        bridge.reconcile({
          status: "transformed",
          transactionId: `server-normalized-${server_responses++}`,
          operations: SERVER_NORMALIZED_OPERATIONS,
          requestedOperations: REQUESTED_OPERATIONS,
        }),
      );
    },
    importLeads(start_row) {
      const started = performance.now();
      grid.insertRows(start_row, LEAD_IMPORT_ROWS);
      const insert_ms = performance.now() - started;
      const load_started = performance.now();
      let batches = 0;
      for (let offset = 0; offset < LEAD_IMPORT_ROWS; offset += LEAD_LOAD_BATCH_ROWS) {
        const row_count = Math.min(LEAD_LOAD_BATCH_ROWS, LEAD_IMPORT_ROWS - offset);
        const patches: DocumentOp[] = [];
        for (let index = 0; index < row_count; index++) {
          const lead = offset + index;
          const values = [
            revenueAccountName(lead + INITIAL_ACCOUNTS.length),
            12_000 + ((lead * 17) % 40) * 1_200,
            REGIONS[lead % REGIONS.length] ?? "North",
            OWNERS[lead % OWNERS.length] ?? "Ada Chen",
            lead % 5 === 0 ? "Proposal" : "Qualification",
          ];
          for (let col = 0; col < values.length; col++) {
            const value = values[col];
            if (value !== undefined)
              patches.push({
                op: "set",
                addr: { sheet: "sheet1", row: start_row + lead, col },
                value: { kind: "literal", value },
              });
          }
        }
        grid.applyTransaction({ patches });
        batches++;
      }
      grid.scrollToCell({ sheet: "sheet1", row: start_row, col: 0 });
      return { insertMs: insert_ms, loadMs: performance.now() - load_started, batches };
    },
    dispose() {
      stop_theme();
      controller.destroy();
    },
  };
}
