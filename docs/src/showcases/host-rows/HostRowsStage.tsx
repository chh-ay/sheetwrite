import { errorText } from "@docs/lib/errors.js";
import { applyHostProjection, type HostEntity } from "@docs/showcases/host-rows-store.js";
import type { RowBridgeProjection } from "@sheetwrite/core";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { Icon } from "../../components/Icon.js";
import { ActionError } from "../../lib/use-action.js";
import { ShowcaseControlGroup, ShowcaseReadout, ShowcaseStage } from "../layout/ShowcaseLayout.js";
import { whenNearViewport } from "../lib/near-viewport.js";
import { Button } from "../ui/Button.js";
import { INITIAL_ACCOUNTS, LEAD_IMPORT_ROWS } from "./accounts.js";
import type { AccountsGrid, ImportTiming } from "./boot.js";

const HOST_PREVIEW_ROWS = 120;
/** Delta log entries kept, newest first. */
const LOG_LIMIT = 8;
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface DeltaLogEntry {
  readonly id: number;
  readonly status: string;
  readonly text: string;
}

/** One line per projection: what moved, named by account ID. */
function describeProjection(projection: RowBridgeProjection<string>): string {
  const details = projection.deltas.slice(0, 3).map((delta) => {
    if (delta.kind === "cell") {
      const value = delta.cell.next;
      return `${delta.cell.rowId} · ${delta.cell.columnKey} → ${value?.kind === "literal" ? String(value.value) : "formula"}`;
    }
    if (delta.kind === "row-structure") {
      const ids = delta.action === "insert" ? delta.inserted : delta.removed;
      const count = ids.length.toLocaleString("en");
      return `${delta.action} ${count} ${ids.length === 1 ? "row" : "rows"} · ${ids.slice(0, 3).join(", ")}${ids.length > 3 ? "…" : ""}`;
    }
    // The remaining kinds carry no host row value: name what actually moved.
    if (delta.kind === "metadata") return `${delta.metadata} metadata · no host value changed`;
    if (delta.kind === "host-action") return `${delta.action} · sheet action for the host`;
    if (delta.kind === "unprojectable") return `no row-space meaning · ${delta.reason}`;
    return `${delta.kind} · ${delta.cells.length.toLocaleString("en")} cells`;
  });
  const summary =
    details.join("; ") ||
    (projection.status === "rejected"
      ? "Write rejected · the host record keeps its stored value"
      : "No host values changed.");
  return `${summary}${projection.deltas.length > 3 ? ` · ${projection.deltas.length.toLocaleString("en")} deltas in total` : ""}`;
}

/** The host rows showcase's island: the accounts grid beside the app's own store. */
export function HostRowsStage() {
  let host!: HTMLDivElement;
  const [accounts, setAccounts] = createSignal<AccountsGrid | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [entities, setEntities] = createSignal(
    new Map(INITIAL_ACCOUNTS.map((row) => [row.id, row])),
  );
  const [log, setLog] = createSignal<DeltaLogEntry[]>([]);
  const [importResult, setImportResult] = createSignal<ImportTiming | null>(null);
  let logSequence = 0;

  const applyProjection = (projection: RowBridgeProjection<string>) => {
    const text = describeProjection(projection);
    setLog((entries) =>
      [{ id: logSequence++, status: projection.status, text }, ...entries].slice(0, LOG_LIMIT),
    );
    setEntities((current) => applyHostProjection(current, projection));
  };

  onMount(() => {
    let disposed = false;
    const stopWaiting = whenNearViewport(host, () => {
      import("./boot.js")
        .then(({ startAccountsGrid }) => startAccountsGrid(host, { onProjection: applyProjection }))
        .then((started) => {
          if (disposed) return started.dispose();
          setAccounts(started);
        })
        .catch((cause: unknown) => {
          if (!disposed) setError(errorText(cause));
        });
    });
    onCleanup(() => {
      disposed = true;
      stopWaiting();
      accounts()?.dispose();
    });
  });

  const ready = () => accounts() !== null;
  const grid = () => accounts()?.grid;
  const arr = () => [...entities().values()].reduce((total, row) => total + row.amount, 0);
  const remoteUpdate = () => {
    const account = entities().get("account-001");
    if (!account) return;
    grid()?.applyRemoteOperations([
      {
        op: "set",
        addr: { sheet: "sheet1", row: 0, col: 1 },
        value: { kind: "literal", value: account.amount + 15_000 },
      },
    ]);
  };
  const importLeads = () => {
    const current = accounts();
    if (!current || importResult()) return;
    setImportResult(current.importLeads(entities().size));
  };

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup
            description="Each lead gets a stable ID from the row bridge; the insert is one commit."
            title="Import leads"
          >
            <Button
              data-testid="host-import-leads"
              disabled={!ready() || importResult() !== null}
              onClick={importLeads}
              variant="primary"
            >
              <Icon name="upload" />
              {importResult()
                ? `${LEAD_IMPORT_ROWS.toLocaleString("en")} leads imported`
                : `Import ${LEAD_IMPORT_ROWS.toLocaleString("en")} leads`}
            </Button>
            <ShowcaseReadout
              items={[
                {
                  label: "Host-owned ARR",
                  value: (
                    <output aria-live="polite" data-testid="host-arr-total">
                      <strong>{money.format(arr())}</strong>
                    </output>
                  ),
                },
                { label: "Accounts", value: entities().size.toLocaleString("en") },
                {
                  label: "Import time",
                  value: (
                    <output aria-live="polite" data-testid="host-import-timing">
                      {importResult()
                        ? `${importResult()?.insertMs.toFixed(1)} ms · ${importResult()?.batches} commits`
                        : "Not run"}
                    </output>
                  ),
                },
              ]}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup title="Host changes">
            <Button disabled={!ready() || !entities().has("account-001")} onClick={remoteUpdate}>
              <Icon name="refresh" />
              Remote update
            </Button>
            <Button disabled={!ready()} onClick={() => grid()?.insertRows(1)}>
              <Icon name="plus" />
              Insert row
            </Button>
            <Button disabled={!ready()} onClick={() => grid()?.removeRows(1)}>
              <Icon name="minus" />
              Delete row
            </Button>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Sort and filter change the view, never the account store."
            title="View only"
          >
            <Button
              disabled={!ready()}
              onClick={() => grid()?.setViewSort([{ col: 1, ascending: false }])}
            >
              <Icon name="sort-desc" />
              Sort view by amount
            </Button>
            <Button disabled={!ready()} onClick={() => grid()?.filterBy(2, "North")}>
              <Icon name="filter" />
              Filter North
            </Button>
            <Button disabled={!ready()} onClick={() => grid()?.setColumnFilter(2, null)}>
              <Icon name="close" />
              Clear filter
            </Button>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup title="Write policy">
            <Button disabled={!ready()} onClick={() => accounts()?.rejectNextEdit()}>
              <Icon name="shield" />
              Reject next edit
            </Button>
            <Button disabled={!ready()} onClick={() => accounts()?.transformedAccept()}>
              <Icon name="check" />
              Transformed accept
            </Button>
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <div class="host-rows-showcase" data-testid="host-rows-showcase">
          <div
            class="sheetwrite host-rows-grid"
            ref={(element) => {
              host = element;
            }}
            style={{ height: "428px" }}
          />
          <ActionError error={error()} />
          <HostState entities={entities()} log={log()} />
        </div>
      }
      demoLabel="Live CRM workbook"
      demoTitle="Accounts"
    />
  );
}

/** The app's own state beside the Grid: the account store and the deltas it received. */
function HostState(
  props: Readonly<{ entities: ReadonlyMap<string, HostEntity>; log: readonly DeltaLogEntry[] }>,
) {
  const rows = () => [...props.entities.values()].slice(0, HOST_PREVIEW_ROWS);
  return (
    <section aria-label="Host-owned state" class="host-row-proof">
      <div class="host-row-panel">
        <header>
          <h2>Account store</h2>
          <span data-testid="host-record-count">
            {props.entities.size.toLocaleString("en")} records
            {props.entities.size > HOST_PREVIEW_ROWS
              ? ` · first ${HOST_PREVIEW_ROWS.toLocaleString("en")} shown`
              : ""}
          </span>
        </header>
        <div class="host-row-table-scroll">
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
              <For each={rows()}>
                {(row) => (
                  <tr data-account-id={row.id}>
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
                      <span class="host-row-stage-pill" data-stage={row.stage}>
                        {row.stage}
                      </span>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
      <div class="host-row-panel host-row-events">
        <header>
          <h2>Delta log</h2>
          <span>{props.log.length} recent</span>
        </header>
        <ol aria-live="polite" data-testid="host-delta-log">
          <For each={props.log}>
            {(entry) => (
              <li data-status={entry.status}>
                <strong>{entry.status}</strong>
                <span>{entry.text}</span>
              </li>
            )}
          </For>
        </ol>
        <Show when={props.log.length === 0}>
          <p class="host-row-empty">
            Run a remote update, edit an ARR cell, or reject a write. Its account delta appears
            here.
          </p>
        </Show>
      </div>
    </section>
  );
}
