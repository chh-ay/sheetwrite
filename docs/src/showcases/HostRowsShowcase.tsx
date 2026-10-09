import {
  createRowBridge,
  type DocumentOp,
  type Grid,
  type RowBridgeProjection,
} from "@sheetwrite/core";
import { createSimpleGridInput } from "@sheetwrite/core/adapter";
import { SheetwriteGrid } from "@sheetwrite/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteTopbar } from "../components/SiteTopbar.js";
import { CapabilityHero } from "./CapabilityHero.js";
import { revenueAccountName } from "./revenue.js";

const LEAD_IMPORT_ROWS = 10_000;
const HOST_PREVIEW_ROWS = 120;
/** One Grid commit accepts at most 10,000 operations, so cells load in batches. */
const LEAD_LOAD_BATCH_ROWS = 1_800;

interface HostEntity extends Record<string, string | number | boolean | null> {
  id: string;
  name: string;
  amount: number;
  region: string;
  owner: string;
  stage: string;
}

const columns = [
  { key: "name" as const, title: "Account", width: 440 },
  { key: "amount" as const, title: "ARR · USD", type: "number" as const, width: 220 },
  { key: "region" as const, title: "Region", width: 200 },
  { key: "owner" as const, title: "Owner", width: 260 },
  { key: "stage" as const, title: "Stage", width: 320 },
];
const owners = ["Ada Chen", "Lin Patel", "Maya Reyes", "Noah Ellis"];
const regions = ["North", "South", "West", "East"];
const stages = ["Renewal", "Qualification", "Proposal", "Contract review"];
const accountNames = [
  "Alder Quay",
  "Beacon Ridge",
  "Juniper",
  "Cedar Vale",
  "Marsh Point",
  "Willow Lane",
  "Orchard Bay",
  "Cobalt Grove",
];
const industries = ["Logistics", "Health", "Works", "Energy", "Foods", "Systems"];
const initialRows: HostEntity[] = Array.from({ length: 48 }, (_, index) => ({
  id: `account-${String(index + 1).padStart(3, "0")}`,
  name: `${accountNames[index % accountNames.length]} ${industries[Math.floor(index / accountNames.length)]}`,
  amount:
    index === 0
      ? 120_000
      : index === 1
        ? 75_000
        : index === 2
          ? 210_000
          : 24_000 + ((index * 17) % 72) * 3_000,
  region: regions[index % regions.length] ?? "North",
  owner: owners[index % owners.length] ?? "Ada Chen",
  stage: stages[index % stages.length] ?? "Qualification",
}));
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function HostRowsShowcase() {
  const grid = useRef<Grid | null>(null);
  const nextId = useRef(initialRows.length + 1);
  const denyNext = useRef(false);
  const logSequence = useRef(0);
  const [ready, setReady] = useState(false);
  const [entities, setEntities] = useState(() => new Map(initialRows.map((row) => [row.id, row])));
  const [log, setLog] = useState<Array<{ id: number; status: string; text: string }>>([]);
  const [importResult, setImportResult] = useState<{
    insertMs: number;
    loadMs: number;
    batches: number;
  } | null>(null);
  const input = useMemo(() => {
    const value = createSimpleGridInput({
      columns,
      defaultRows: initialRows,
      sheetName: "Accounts",
    });
    const sheet = value.workbook.sheets[0];
    if (!sheet) throw new Error("The account workbook has no sheet.");
    sheet.protectedRanges = [
      {
        id: "host-check",
        range: {
          sheet: "sheet1",
          start: { row: 0, col: 0 },
          end: { row: initialRows.length - 1, col: columns.length - 1 },
        },
      },
    ];
    return value;
  }, []);
  const bridge = useMemo(
    () =>
      createRowBridge({
        columns,
        defaultRows: initialRows,
        getRowId: (row) => row.id,
        createRowId: () => `account-${String(nextId.current++).padStart(3, "0")}`,
      }),
    [],
  );

  useEffect(() => {
    const observer = new MutationObserver(() => grid.current?.replaceTheme({ rowHeight: 36 }));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const applyProjection = (projection: RowBridgeProjection<string>) => {
    const details = projection.deltas.slice(0, 3).map((delta) => {
      if (delta.kind === "cell") {
        const value = delta.cell.next;
        return `${delta.cell.rowId} · ${delta.cell.columnKey} → ${value?.kind === "literal" ? String(value.value) : "formula"}`;
      }
      if (delta.kind === "row-structure") {
        const ids = delta.action === "insert" ? delta.inserted : delta.removed;
        const count = ids.length.toLocaleString();
        return `${delta.action} ${count} ${ids.length === 1 ? "row" : "rows"} · ${ids.slice(0, 3).join(", ")}${ids.length > 3 ? "…" : ""}`;
      }
      // The remaining kinds carry no host row value: name what actually moved.
      if (delta.kind === "metadata") return `${delta.metadata} metadata · no host value changed`;
      if (delta.kind === "host-action") return `${delta.action} · sheet action for the host`;
      if (delta.kind === "unprojectable") return `no row-space meaning · ${delta.reason}`;
      return `${delta.kind} · ${delta.cells.length.toLocaleString()} cells`;
    });
    const summary =
      details.join("; ") ||
      (projection.status === "rejected"
        ? "Write rejected · the host record keeps its stored value"
        : "No host values changed.");
    setLog((entries) =>
      [
        {
          id: logSequence.current++,
          status: projection.status,
          text: `${summary}${projection.deltas.length > 3 ? ` · ${projection.deltas.length.toLocaleString()} deltas in total` : ""}`,
        },
        ...entries,
      ].slice(0, 8),
    );
    setEntities((current) => {
      const next = new Map(current);
      for (const delta of projection.deltas) {
        if (delta.kind === "cell") {
          const { rowId, columnKey, next: value } = delta.cell;
          const row = rowId === null ? undefined : next.get(rowId);
          if (row && columnKey && value?.kind === "literal")
            next.set(row.id, { ...row, [columnKey]: value.value });
        } else if (delta.kind === "row-structure" && delta.action === "insert") {
          for (const rowId of delta.inserted) {
            if (rowId !== null)
              next.set(rowId, {
                id: rowId,
                name: "New account",
                amount: 0,
                region: "North",
                owner: "Ada Chen",
                stage: "Qualification",
              });
          }
        } else if (delta.kind === "row-structure" && delta.action === "delete") {
          for (const rowId of delta.removed) if (rowId !== null) next.delete(rowId);
        }
      }
      return next;
    });
  };
  const arr = [...entities.values()].reduce((total, row) => total + row.amount, 0);
  const remoteUpdate = () => {
    const account = entities.get("account-001");
    if (!account) return;
    grid.current?.applyRemoteOperations([
      {
        op: "set",
        addr: { sheet: "sheet1", row: 0, col: 1 },
        value: { kind: "literal", value: account.amount + 15_000 },
      },
    ]);
  };
  const importLeads = () => {
    const active = grid.current;
    if (!active || importResult) return;
    const startRow = entities.size;
    const started = performance.now();
    active.insertRows(startRow, LEAD_IMPORT_ROWS);
    const insertMs = performance.now() - started;
    const loadStarted = performance.now();
    let batches = 0;
    for (let offset = 0; offset < LEAD_IMPORT_ROWS; offset += LEAD_LOAD_BATCH_ROWS) {
      const rowCount = Math.min(LEAD_LOAD_BATCH_ROWS, LEAD_IMPORT_ROWS - offset);
      const patches: DocumentOp[] = [];
      for (let index = 0; index < rowCount; index++) {
        const lead = offset + index;
        const values = [
          revenueAccountName(lead + initialRows.length),
          12_000 + ((lead * 17) % 40) * 1_200,
          regions[lead % regions.length] ?? "North",
          owners[lead % owners.length] ?? "Ada Chen",
          lead % 5 === 0 ? "Proposal" : "Qualification",
        ];
        for (let col = 0; col < values.length; col++) {
          const value = values[col];
          if (value !== undefined)
            patches.push({
              op: "set",
              addr: { sheet: "sheet1", row: startRow + lead, col },
              value: { kind: "literal", value },
            });
        }
      }
      active.applyTransaction({ patches });
      batches++;
    }
    setImportResult({ insertMs, loadMs: performance.now() - loadStarted, batches });
    active.scrollToCell({ sheet: "sheet1", row: startRow, col: 0 });
  };

  return (
    <div className="host-rows-frame">
      <SiteTopbar active="showcases" />
      <main className="host-rows-showcase" data-testid="host-rows-showcase">
        <CapabilityHero
          eyebrow="CAPABILITY / HOST-OWNED ROWS"
          title="Move the view. Keep the account."
          description="Your app owns the account store. Sort, filter, and edit the Grid. Every delta still names the same account ID."
          facts={[
            { label: "Accounts", value: "48 + 10,000 leads" },
            { label: "Coverage", value: "4 regions" },
            { label: "Identity", value: "Stable account IDs" },
            { label: "Write policy", value: "Host decides" },
          ]}
        />
        <section className="host-row-stage" aria-label="Live CRM workbook">
          <header className="host-row-stage__bar">
            <div>
              <p>New in 0.5.0 · fast row ID checks</p>
              <h2>Import the leads. Keep every ID unique.</h2>
            </div>
            <button
              className="host-row-primary"
              type="button"
              disabled={!ready || importResult !== null}
              onClick={importLeads}
              data-testid="host-import-leads"
            >
              {importResult ? "10,000 leads imported" : "Import 10,000 leads"}
            </button>
            <output aria-live="polite" data-testid="host-arr-total">
              <strong>{money.format(arr)}</strong>
              <span>{entities.size} accounts · host-owned ARR</span>
            </output>
            <output
              className="host-row-import-time"
              aria-live="polite"
              data-testid="host-import-timing"
            >
              <strong>{importResult ? `${importResult.insertMs.toFixed(1)} ms` : "—"}</strong>
              <span>
                {importResult
                  ? `ID checks + row insertion · cell load ${importResult.loadMs.toFixed(0)} ms in ${importResult.batches} commits`
                  : "Lead import time. Measured in this browser when you import."}
              </span>
            </output>
          </header>
          <div className="host-row-actions">
            <fieldset className="host-row-actions__group">
              <legend>Host changes</legend>
              <button
                type="button"
                disabled={!ready || !entities.has("account-001")}
                onClick={remoteUpdate}
              >
                Remote update
              </button>
              <button type="button" disabled={!ready} onClick={() => grid.current?.insertRows(1)}>
                Insert row
              </button>
              <button type="button" disabled={!ready} onClick={() => grid.current?.removeRows(1)}>
                Delete row
              </button>
            </fieldset>
            <fieldset className="host-row-actions__group">
              <legend>View only</legend>
              <button
                type="button"
                disabled={!ready}
                onClick={() => grid.current?.sortBy(1, false)}
              >
                Sort amount
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() => grid.current?.filterBy(2, "North")}
              >
                Filter North
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() => grid.current?.setColumnFilter(2, null)}
              >
                Clear filter
              </button>
            </fieldset>
            <fieldset className="host-row-actions__group">
              <legend>Write policy</legend>
              <button
                type="button"
                disabled={!ready}
                onClick={() => {
                  denyNext.current = true;
                  grid.current?.applyTransaction({
                    patches: [
                      {
                        op: "set",
                        addr: { sheet: "sheet1", row: 0, col: 1 },
                        value: { kind: "literal", value: 999 },
                      },
                    ],
                  });
                }}
              >
                Reject next edit
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() =>
                  applyProjection(
                    bridge.reconcile({
                      status: "transformed",
                      transactionId: "server-normalized",
                      operations: [
                        {
                          op: "set",
                          addr: { sheet: "sheet1", row: 1, col: 1 },
                          value: { kind: "literal", value: 80_000 },
                        },
                      ],
                    }),
                  )
                }
              >
                Transformed accept
              </button>
            </fieldset>
          </div>
          <SheetwriteGrid
            {...input}
            ref={grid}
            presentation="data-grid"
            theme={{ rowHeight: 36 }}
            rowBridge={bridge}
            onReady={() => setReady(true)}
            onRowDelta={applyProjection}
            onMutationRejected={() =>
              applyProjection(
                bridge.reconcile({
                  status: "rejected",
                  transactionId: "rejected-showcase",
                  operations: [],
                }),
              )
            }
            protectionResolver={() => {
              if (!denyNext.current) return "allow";
              denyNext.current = false;
              return "deny";
            }}
            height={428}
          />
          <p className="host-row-stage__note">
            Each imported lead gets a stable ID from the row bridge. The insert is one commit; the
            50,000 cell values load in bounded batches, because one Grid transaction accepts 10,000
            operations. Sort and filter change only the view.
          </p>
        </section>
        <section className="host-row-proof" aria-label="Host-owned state">
          <div className="host-row-panel">
            <header>
              <div>
                <p>App state · not a Grid copy</p>
                <h2>Account store</h2>
              </div>
              <span data-testid="host-record-count">
                {entities.size.toLocaleString()} records
                {entities.size > HOST_PREVIEW_ROWS
                  ? ` · first ${HOST_PREVIEW_ROWS.toLocaleString()} shown`
                  : ""}
              </span>
            </header>
            <div className="host-row-table-scroll">
              <table data-testid="host-entity-list">
                <thead>
                  <tr>
                    <th>Account / ID</th>
                    <th>ARR</th>
                    <th>Owner / region</th>
                    <th>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {[...entities.values()].slice(0, HOST_PREVIEW_ROWS).map((row) => (
                    <tr key={row.id} data-account-id={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                        <code>{row.id}</code>
                      </td>
                      <td>{money.format(row.amount)}</td>
                      <td>
                        {row.owner}
                        <small>{row.region}</small>
                      </td>
                      <td>
                        <span className="host-row-stage-pill" data-stage={row.stage}>
                          {row.stage}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="host-row-panel host-row-events">
            <header>
              <div>
                <p>Transaction boundary</p>
                <h2>Delta log</h2>
              </div>
              <span>{log.length} recent</span>
            </header>
            <ol data-testid="host-delta-log" aria-live="polite">
              {log.map((entry) => (
                <li key={entry.id} data-status={entry.status}>
                  <strong>{entry.status}</strong>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ol>
            {log.length === 0 ? (
              <p className="host-row-empty">
                Run a renewal update, edit an ARR cell, or reject a write. Its account delta appears
                here.
              </p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
