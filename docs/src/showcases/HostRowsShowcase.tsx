import {
  createRowBridge,
  type DocumentOp,
  type Grid,
  type GridConfig,
  type ProtectionResolver,
  type RowBridgeProjection,
} from "@sheetwrite/core";
import { createSimpleGridInput } from "@sheetwrite/core/adapter";
import { SheetwriteGrid } from "@sheetwrite/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "../components/Icon.js";
import { observeSiteTheme } from "../lib/site-theme.js";
import { applyHostProjection, type HostEntity } from "./host-rows-store.js";
import {
  ShowcaseControlGroup,
  ShowcaseLayout,
  ShowcaseReadout,
  ShowcaseSection,
} from "./layout/ShowcaseLayout.js";
import { revenueAccountName } from "./revenue.js";
import { siteGridTheme } from "./site-grid-theme.js";
import HostRowsSnippet from "./snippets/host-rows.mdx";
import { DemoButton } from "./ui/DemoButton.js";

const LEAD_IMPORT_ROWS = 10_000;
/** Accounts the host store starts with. */
const ACCOUNT_ROWS = 48;
const HOST_PREVIEW_ROWS = 120;
/** One Grid commit accepts at most 10,000 operations, so cells load in batches. */
const LEAD_LOAD_BATCH_ROWS = 1_800;
const GRID_CONFIG: GridConfig = {
  contextMenu: [
    { action: "copy", label: "Copy account value" },
    { action: "paste" },
    { action: "separator" },
    { action: "exportCsv", label: "Export host accounts" },
  ],
};
/** The ARR value the host asks the server to store for account-002. */
const REQUESTED_OPERATIONS: DocumentOp[] = [
  {
    op: "set",
    addr: { sheet: "sheet1", row: 1, col: 1 },
    value: { kind: "literal", value: 79_950 },
  },
];
/** The server rounds the requested ARR to the nearest 1,000 before it stores it. */
const SERVER_NORMALIZED_OPERATIONS: DocumentOp[] = [
  {
    op: "set",
    addr: { sheet: "sheet1", row: 1, col: 1 },
    value: { kind: "literal", value: 80_000 },
  },
];

// Widths sum to 880 px so every column is visible in the demo beside the side
// panel at desktop widths; a clipped last column reads as a broken layout.
const columns = [
  { key: "name" as const, title: "Account", width: 280 },
  { key: "amount" as const, title: "ARR · USD", type: "number" as const, width: 130 },
  { key: "region" as const, title: "Region", width: 110 },
  { key: "owner" as const, title: "Owner", width: 170 },
  { key: "stage" as const, title: "Stage", width: 190 },
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
const initialRows: HostEntity[] = Array.from({ length: ACCOUNT_ROWS }, (_, index) => ({
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
  const serverResponses = useRef(0);
  const applyingServerResult = useRef(false);
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

  // The grid paints with resolved colors, so it re-reads the site tokens when
  // the page theme changes.
  const applySiteTheme = () => grid.current?.replaceTheme({ ...siteGridTheme(), rowHeight: 36 });
  useEffect(() => observeSiteTheme(applySiteTheme), []);

  // A changed protection resolver makes the adapter rebuild the Grid from its
  // initial rows, which would undo every edit after each host render. Keep one
  // resolver for the page's life; it reads the latest choice from a ref.
  const protectionResolver = useCallback<ProtectionResolver>(() => {
    if (!denyNext.current) return "allow";
    denyNext.current = false;
    return "deny";
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
    setEntities((current) => applyHostProjection(current, projection));
  };
  const transformedAccept = () => {
    const active = grid.current;
    if (!active) return;

    // The server accepts the host's request in a normalized form. The Grid must
    // show the stored result, so apply it first and report it to the host once,
    // as the transformed acceptance, not also as a plain remote change.
    applyingServerResult.current = true;
    let applied = false;
    try {
      applied = active.applyRemoteOperations(SERVER_NORMALIZED_OPERATIONS).status === "applied";
    } finally {
      applyingServerResult.current = false;
    }
    if (!applied) return;

    applyProjection(
      bridge.reconcile({
        status: "transformed",
        transactionId: `server-normalized-${serverResponses.current++}`,
        operations: SERVER_NORMALIZED_OPERATIONS,
        requestedOperations: REQUESTED_OPERATIONS,
      }),
    );
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

  const sortByAmount = () => grid.current?.setViewSort([{ col: 1, ascending: false }]);
  const rejectNextEdit = () => {
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
  };

  return (
    <ShowcaseLayout
      code={{ title: "The code behind it", Snippet: HostRowsSnippet }}
      controls={
        <>
          <ShowcaseControlGroup
            title="Import leads"
            description="Each lead gets a stable ID from the row bridge; the insert is one commit."
          >
            <DemoButton
              data-testid="host-import-leads"
              disabled={!ready || importResult !== null}
              onClick={importLeads}
              variant="primary"
            >
              <Icon name="upload" />
              {importResult
                ? `${LEAD_IMPORT_ROWS.toLocaleString("en")} leads imported`
                : `Import ${LEAD_IMPORT_ROWS.toLocaleString("en")} leads`}
            </DemoButton>
            <ShowcaseReadout
              items={[
                {
                  label: "Host-owned ARR",
                  value: (
                    <output aria-live="polite" data-testid="host-arr-total">
                      <strong>{money.format(arr)}</strong>
                    </output>
                  ),
                },
                { label: "Accounts", value: entities.size.toLocaleString("en") },
                {
                  label: "Import time",
                  value: (
                    <output aria-live="polite" data-testid="host-import-timing">
                      {importResult
                        ? `${importResult.insertMs.toFixed(1)} ms · ${importResult.batches} commits`
                        : "Not run"}
                    </output>
                  ),
                },
              ]}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup title="Host changes">
            <DemoButton disabled={!ready || !entities.has("account-001")} onClick={remoteUpdate}>
              <Icon name="refresh" />
              Remote update
            </DemoButton>
            <DemoButton disabled={!ready} onClick={() => grid.current?.insertRows(1)}>
              <Icon name="plus" />
              Insert row
            </DemoButton>
            <DemoButton disabled={!ready} onClick={() => grid.current?.removeRows(1)}>
              <Icon name="minus" />
              Delete row
            </DemoButton>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            title="View only"
            description="Sort and filter change the view, never the account store."
          >
            <DemoButton disabled={!ready} onClick={sortByAmount}>
              <Icon name="sort-desc" />
              Sort view by amount
            </DemoButton>
            <DemoButton disabled={!ready} onClick={() => grid.current?.filterBy(2, "North")}>
              <Icon name="filter" />
              Filter North
            </DemoButton>
            <DemoButton disabled={!ready} onClick={() => grid.current?.setColumnFilter(2, null)}>
              <Icon name="close" />
              Clear filter
            </DemoButton>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup title="Write policy">
            <DemoButton disabled={!ready} onClick={rejectNextEdit}>
              <Icon name="shield" />
              Reject next edit
            </DemoButton>
            <DemoButton disabled={!ready} onClick={transformedAccept}>
              <Icon name="check" />
              Transformed accept
            </DemoButton>
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <div className="host-rows-showcase" data-testid="host-rows-showcase">
          <SheetwriteGrid
            {...input}
            ref={grid}
            presentation="data-grid"
            theme={{ rowHeight: 36 }}
            rowBridge={bridge}
            config={GRID_CONFIG}
            onReady={() => {
              applySiteTheme();
              setReady(true);
            }}
            onRowDelta={(projection) => {
              if (!applyingServerResult.current) applyProjection(projection);
            }}
            onMutationRejected={() =>
              applyProjection(
                bridge.reconcile({
                  status: "rejected",
                  transactionId: "rejected-showcase",
                  operations: [],
                }),
              )
            }
            protectionResolver={protectionResolver}
            height={428}
          />
          <HostState entities={entities} log={log} />
        </div>
      }
      demoLabel="Live CRM workbook"
      demoTitle="Accounts"
      eyebrow="Data"
      facts={[
        { label: "Accounts", value: ACCOUNT_ROWS.toLocaleString("en") },
        { label: "Leads to import", value: LEAD_IMPORT_ROWS.toLocaleString("en") },
        { label: "Identity", value: "Stable account IDs" },
      ]}
      guide={{
        href: "/docs/features/data/host-owned-rows/",
        label: "Read the host-owned rows guide",
      }}
      id="host-rows"
      task="Your app owns the account store. Sort the view, filter and edit the grid, then import thousands of leads: every delta still names the same account ID."
      title="Move the view. Keep the account."
    >
      <ShowcaseSection id="host-rows-loading" title="How the import loads">
        <p>
          The insert of {LEAD_IMPORT_ROWS.toLocaleString("en")} rows is one commit. Their{" "}
          {(LEAD_IMPORT_ROWS * columns.length).toLocaleString("en")} cell values load in batches of{" "}
          {LEAD_LOAD_BATCH_ROWS.toLocaleString("en")} rows, because one Grid transaction accepts a
          bounded number of operations.
        </p>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}

type DeltaLogEntry = { id: number; status: string; text: string };

/** The app's own state beside the Grid: the account store and the deltas it received. */
function HostState({
  entities,
  log,
}: Readonly<{ entities: ReadonlyMap<string, HostEntity>; log: readonly DeltaLogEntry[] }>) {
  return (
    <section className="host-row-proof" aria-label="Host-owned state">
      <div className="host-row-panel">
        <header>
          <h2>Account store</h2>
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
          <h2>Delta log</h2>
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
            Run a remote update, edit an ARR cell, or reject a write. Its account delta appears
            here.
          </p>
        ) : null}
      </div>
    </section>
  );
}
