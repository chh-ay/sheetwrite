import { For, Show } from "solid-js";

import {
  averageRequestedColumns,
  cacheCeilingMiB,
  cachePercent,
  changedResourceOwners,
  columnBandsLabel,
  crossings,
  currentColumns,
  exportAttempt,
  formatSize,
  recentEvictions,
  recentTiles,
  resourceDelta,
  resourceOwners,
  runCrossings,
  runExport,
  runScan,
  scan,
  stats,
  telemetry,
} from "./workbench.js";

function formatByteDelta(bytes: number): string {
  if (bytes === 0) return "0 B";
  return `${bytes > 0 ? "+" : "−"}${formatSize(Math.abs(bytes))}`;
}

/** The disclosure summary the performance sections share. */
function DisclosureSummary(props: Readonly<{ title: string; note: string }>) {
  return (
    <summary>
      <span class="sw-sp-disclosure-copy">
        <strong>{props.title}</strong>
        <small>{props.note}</small>
      </span>
      <span aria-hidden="true" class="sw-sp-disclosure-chevron">
        ›
      </span>
    </summary>
  );
}

/** Datasource paging: tiles, residence and prefetch decisions. */
function PagingSection() {
  return (
    <section aria-labelledby="paging-title" class="sw-sp-section" id="paging">
      <h2 class="sw-showcase__section-title" id="paging-title">
        Only the columns on screen are loaded
      </h2>
      <p>
        Each request names the exact columns it needs, and the source returns only those, with
        explicit <code>null</code> blanks. The source setting is{" "}
        <code>{`{ protocol: 2, columns: "windowed" }`}</code>.
      </p>

      <details class="sw-sp-diagnostics">
        <DisclosureSummary
          note="Live source counters"
          title="Inspect live requests, tile memory, and loading history"
        />
        <dl class="sw-sp-stats" data-testid="scale-stats">
          <div>
            <dt>Requests / aborts</dt>
            <dd data-testid="scale-requests">
              {telemetry().requests.toLocaleString("en")} /{" "}
              {telemetry().aborted.toLocaleString("en")}
            </dd>
          </div>
          <div>
            <dt>Requested cells</dt>
            <dd data-testid="scale-requested-cells">
              {telemetry().requestedCells.toLocaleString("en")}
            </dd>
            <dd class="sw-sp-stat-context">{formatSize(telemetry().requestBytes)} request JSON</dd>
          </div>
          <div>
            <dt>Returned cells</dt>
            <dd data-testid="scale-returned-cells">
              {telemetry().returnedCells.toLocaleString("en")}
            </dd>
            <dd class="sw-sp-stat-context">{formatSize(telemetry().returnedBytes)} row JSON</dd>
          </div>
          <div>
            <dt>Columns / returned row</dt>
            <dd data-testid="scale-column-amplification">{averageRequestedColumns().toFixed(2)}</dd>
            <dd class="sw-sp-stat-context">current visible width {currentColumns()}</dd>
          </div>
          <div>
            <dt>Resident tile payload</dt>
            <dd data-testid="scale-allocated">{formatSize(stats().paged?.allocatedBytes ?? 0)}</dd>
            <dd class="sw-sp-stat-context">
              {cacheCeilingMiB().toLocaleString("en")} MiB cache ceiling ·{" "}
              {Math.round(cachePercent())}% resident
            </dd>
          </div>
          <div>
            <dt>Dirty overlay</dt>
            <dd data-testid="scale-dirty-cells">
              {(stats().paged?.dirtyCells ?? 0).toLocaleString("en")} cells
            </dd>
            <dd class="sw-sp-stat-context">
              {formatSize(stats().paged?.dirtyAllocatedBytes ?? 0)} outside clean budget
            </dd>
          </div>
        </dl>

        <div class="sw-sp-cache-meter">
          <span>Cache use</span>
          {/* An ARIA meter keeps the same track geometry in every browser. */}
          <div
            aria-label="Resident tile cache use"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(cachePercent())}
            class="sw-sp-cache-gauge"
            role="meter"
          >
            <span style={{ width: `${Math.min(cachePercent(), 100)}%` }} />
          </div>
          <strong>
            {Math.round(cachePercent())}% of {cacheCeilingMiB().toLocaleString("en")} MiB
          </strong>
        </div>

        <div class="sw-sp-last-tile" data-testid="scale-last-band">
          <span>Last returned tile</span>
          <Show
            fallback={<strong>Waiting for the first returned tile</strong>}
            when={telemetry().lastReturn}
          >
            {(tile) => (
              <strong>
                rows {tile().start + 1}–{tile().end} · columns {columnBandsLabel(tile().columns)} ·{" "}
                {tile().cells.toLocaleString("en")} cells · {formatSize(tile().returnedBytes)} ·{" "}
                {tile().latencyMs?.toFixed(1)} ms
              </strong>
            )}
          </Show>
        </div>

        <div class="sw-sp-tile-list">
          <div class="sw-sp-tile-list__head">
            <h3>Recent tile map</h3>
            <span data-testid="scale-recent-evictions">
              {recentEvictions()} evicted · public load state at each tile origin
            </span>
          </div>
          <Show
            fallback={<p>Move the Grid to populate this bounded request history.</p>}
            when={recentTiles().length > 0}
          >
            <ol data-testid="scale-tile-list">
              <For each={recentTiles().slice(0, 10)}>
                {(tile) => (
                  <li data-state={tile.residence}>
                    <span>{tile.residence}</span>
                    <strong>
                      {tile.start + 1}–{tile.end} / {columnBandsLabel(tile.columns)}
                    </strong>
                    <small>{tile.cells.toLocaleString("en")} cells</small>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </div>
      </details>

      <details class="sw-sp-debug-disclosure" data-testid="scale-global-details">
        <DisclosureSummary note="SUM + full-sheet CSV" title="Try incomplete global operations" />
        <div class="sw-sp-console">
          <div class="sw-sp-console__intro">
            <h3>Whole-sheet answers need the whole sheet</h3>
            <p>
              With only part of the sheet loaded, a whole-sheet SUM or CSV export cannot be correct.
              These controls call the real APIs, which refuse with <code>IncompleteDataError</code>{" "}
              and report how much is loaded.
            </p>
          </div>
          <div class="sw-sp-actions">
            <button data-testid="scale-scan-attempt" onClick={runScan} type="button">
              Try SUM over all rows
            </button>
            <button data-testid="scale-export-attempt" onClick={runExport} type="button">
              Try full-sheet CSV
            </button>
          </div>
          <Show when={scan()}>
            {(attempt) => (
              <p
                class="sw-sp-verdictline"
                data-state={attempt().ok ? "complete" : "incomplete"}
                data-testid="scale-scan-report"
              >
                <span>{attempt().ok ? "Complete" : "Expected typed refusal"}</span>{" "}
                {(() => {
                  const current = attempt();
                  return current.ok
                    ? `${current.op} = ${current.value.toLocaleString("en")} in ${current.durationMs.toFixed(1)} ms.`
                    : `${current.op} stopped in ${current.durationMs.toFixed(1)} ms: ${current.loadedCells.toLocaleString("en")} of ${current.totalCells.toLocaleString("en")} logical cells are loaded. IncompleteDataError: ${current.message}`;
                })()}
              </p>
            )}
          </Show>
          <Show when={exportAttempt()}>
            {(attempt) => (
              <p
                class="sw-sp-verdictline"
                data-state={attempt().ok ? "complete" : "incomplete"}
                data-testid="scale-export-report"
              >
                <span>{attempt().ok ? "Complete" : "Expected typed refusal"}</span>{" "}
                {(() => {
                  const current = attempt();
                  return current.ok
                    ? `CSV completed at ${formatSize(current.bytes)}.`
                    : `${current.loadedCells.toLocaleString("en")} of ${current.totalCells.toLocaleString("en")} logical cells are loaded. IncompleteDataError prevented a partial file: ${current.message}`;
                })()}
              </p>
            )}
          </Show>
          <Show
            when={(() => {
              const query = stats().query;
              return query?.status === "incomplete" ? query : null;
            })()}
          >
            {(query) => (
              <p class="sw-sp-note" data-testid="scale-query-state">
                Public query capability: incomplete — {query().loadedCells.toLocaleString("en")} of{" "}
                {query().totalCells.toLocaleString("en")} logical cells loaded.
              </p>
            )}
          </Show>
        </div>
      </details>
    </section>
  );
}

/** Memory and resource reports for the loaded workbook. */
function ResourcesSection() {
  return (
    <section aria-labelledby="resource-title" class="sw-sp-section" id="resources">
      <div class="sw-sp-resource-copy">
        <h2 class="sw-showcase__section-title" id="resource-title">
          Data size, allocated memory and WASM pages, apart
        </h2>
        <p>
          The public resource report
          <span data-empty={!stats().resource} data-testid="scale-resource-schema">
            {stats().resource ? ` v${stats().resource?.schemaVersion}` : " (loading report)"}
          </span>{" "}
          shows each separately. The page cache and the unsaved edits are counted on their own.
        </p>
      </div>
      <div class="sw-sp-resource-panel">
        <dl class="sw-sp-stats" data-testid="scale-resource-summary">
          <div>
            <dt>Data size</dt>
            <dd data-testid="scale-resource-logical">
              {formatSize(stats().resource?.totals.logicalLiveBytes ?? 0)}
            </dd>
          </div>
          <div>
            <dt>Allocated memory</dt>
            <dd data-testid="scale-resource-allocated">
              {formatSize(stats().resource?.totals.allocatedCapacityBytes ?? 0)}
            </dd>
          </div>
          <div>
            <dt>WASM pages</dt>
            <dd data-testid="scale-resource-committed">
              {(() => {
                const committed = stats().resource?.wasm.wasmCommittedBytes;
                return committed == null ? "Unavailable" : formatSize(committed);
              })()}
            </dd>
          </div>
        </dl>
        <details class="sw-sp-debug-disclosure">
          <DisclosureSummary
            note={`${resourceOwners().length} active owners`}
            title="Inspect exclusive runtime owners"
          />
          <div class="sw-sp-tablewrap">
            <table class="sw-sp-table" data-testid="scale-resource-owners">
              <caption>Largest exclusive live owners in this mounted Grid.</caption>
              <thead>
                <tr>
                  <th scope="col">Owner</th>
                  <th class="sw-sp-table__num" scope="col">
                    Logical
                  </th>
                  <th class="sw-sp-table__num" scope="col">
                    Allocated
                  </th>
                  <th class="sw-sp-table__num" scope="col">
                    Entries
                  </th>
                </tr>
              </thead>
              <tbody>
                <For each={resourceOwners()}>
                  {(owner) => (
                    <tr>
                      <th scope="row">
                        <code>{owner.owner}</code>
                      </th>
                      <td class="sw-sp-table__num" data-label="Logical">
                        {formatSize(owner.logicalBytes)}
                      </td>
                      <td class="sw-sp-table__num" data-label="Allocated">
                        {formatSize(owner.allocatedBytes)}
                      </td>
                      <td class="sw-sp-table__num" data-label="Entries">
                        {owner.entries.toLocaleString("en")}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

/** Engine calls: WASM boundary crossings per interaction. */
function CrossingsSection() {
  return (
    <section aria-labelledby="crossing-title" class="sw-sp-section" id="wasm-crossings">
      <h2 class="sw-showcase__section-title" id="crossing-title">
        Every call into the engine is counted
      </h2>
      <p>
        Each control commits a real 20,000-cell edit and reads the engine's public counters before
        and after it.
      </p>
      <details class="sw-sp-debug-disclosure" data-testid="scale-crossing-details">
        <DisclosureSummary note="20,000-cell transactions" title="Run raw mutation diagnostics" />
        <div class="sw-sp-console">
          <div class="sw-sp-actions">
            <button
              data-testid="scale-crossings-values"
              onClick={() => runCrossings("values")}
              type="button"
            >
              Commit 20,000 values
            </button>
            <button
              data-testid="scale-crossings-styles"
              onClick={() => runCrossings("styles")}
              type="button"
            >
              Style 20,000 cells
            </button>
          </div>
          <Show when={crossings()[0]}>
            {(latest) => (
              <dl class="sw-sp-operation" data-testid="scale-crossings-latest">
                <div>
                  <dt>Cells</dt>
                  <dd>{latest().cells.toLocaleString("en")}</dd>
                </div>
                <div>
                  <dt>JS↔WASM calls</dt>
                  <dd data-testid="scale-crossings-ffi">{latest().ffiCalls}</dd>
                </div>
                <div>
                  <dt>Largest array</dt>
                  <dd>{latest().maxTransferredArrayLength.toLocaleString("en")}</dd>
                </div>
                <div>
                  <dt>Measured time</dt>
                  <dd>{latest().durationMs.toFixed(1)} ms</dd>
                </div>
              </dl>
            )}
          </Show>
          <Show when={resourceDelta()}>
            {(delta) => (
              <div class="sw-sp-resource-delta" data-testid="scale-resource-delta">
                <h3>
                  Retained owner delta: {delta().from} → {delta().to}
                </h3>
                <Show
                  fallback={<p>No retained owner changed; existing capacity was reused.</p>}
                  when={changedResourceOwners().length > 0}
                >
                  <ul>
                    <For each={changedResourceOwners()}>
                      {(owner) => (
                        <li>
                          <code>{owner.owner}</code>: logical {formatByteDelta(owner.logicalBytes)},
                          allocated {formatByteDelta(owner.allocatedBytes)}, entries{" "}
                          {owner.entries > 0 ? "+" : ""}
                          {owner.entries.toLocaleString("en")}
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </details>
    </section>
  );
}

/** The live sections after the code: paging, resources and engine crossings. */
export function PerformanceDiagnostics() {
  return (
    <>
      <PagingSection />
      <ResourcesSection />
      <CrossingsSection />
    </>
  );
}
