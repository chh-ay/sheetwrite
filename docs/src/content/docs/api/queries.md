---
title: "@sheetwrite/queries"
description: "API reference for @sheetwrite/queries."
---
<span class="api-status" data-status="supported">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/queries`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Declaration target</dt><dd><code>./dist/index.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>30</dd></div>
</dl>

Source entry: `packages/queries/src/index.ts`

## Exported symbols

### Classes <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/queries/query-error/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>QueryError</code></span><span class="api-symbol-card__desc">Fatal source or plan failure; cell-level errors stay in the returned column lanes.</span></a>
</div>

### Functions <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/queries/create-query-session/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>createQuerySession</code></span><span class="api-symbol-card__desc">The one registration call for workbook queries: loads the engine and binds saved queries of grid to the host's fetchSource.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/load-power-query-codec/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>loadPowerQueryCodec</code></span><span class="api-symbol-card__desc">Loads the Power Query codec for XLSX import and export.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/load-query-engine/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>loadQueryEngine</code></span><span class="api-symbol-card__desc">Importing this package loads no WASM; only this explicit call loads query execution.</span></a>
</div>

### Interfaces <span class="api-count" data-pagefind-ignore>15</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/queries/power-query-codec-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>PowerQueryCodecOptions</code></span><span class="api-symbol-card__desc">Hosts can provide the compiled codec artifact, @sheetwrite/queries/power-query-wasm.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-aggregate/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QueryAggregate</code></span><span class="api-symbol-card__desc">Column is required except for countRows; numeric aggregates ignore nulls.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-batch/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QueryBatch</code></span><span class="api-symbol-card__desc">Equal-length columns with a u32 row count; returned buffers are owned by the caller.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-column-spec/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QueryColumnSpec</code></span><span class="api-symbol-card__desc">Stable identity is separate from the field name used by source records.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-diagnostic/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QueryDiagnostic</code></span><span class="api-symbol-card__desc">A stable failure code and optional coordinates, without source values or credentials.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-engine/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QueryEngine</code></span><span class="api-symbol-card__desc">Rust performs parsing and every step; this interface does no source fetching.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-engine-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QueryEngineOptions</code></span><span class="api-symbol-card__desc">Hosts can provide the compiled artifact instead of using browser artifact loading.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-fetch-context/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QueryFetchContext</code></span><span class="api-symbol-card__desc">The signal aborts when the refresh is cancelled or the session is disposed.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-fetch-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QueryFetchRequest</code></span><span class="api-symbol-card__desc">What the host must load for one saved query.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-input/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QueryInput</code></span><span class="api-symbol-card__desc">One execution-local named input, consumed by join steps without a result cache.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-limits/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QueryLimits</code></span><span class="api-symbol-card__desc">Per-execution ceilings; expanding operations reject output before allocation.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-mixed-lanes/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QueryMixedLanes</code></span><span class="api-symbol-card__desc">The tag selects a compact lane; indexes address that lane or the error-code pool.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-refresh-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QueryRefreshOptions</code></span><span class="api-symbol-card__desc">The signal cancels a pending refresh before it writes anything.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-session/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QuerySession</code></span><span class="api-symbol-card__desc">Defines, removes and refreshes the saved queries of one grid.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-session-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>QuerySessionOptions</code></span><span class="api-symbol-card__desc">Host I/O for a session; the engine limits apply to every parse and execution.</span></a>
</div>

### Types <span class="api-count" data-pagefind-ignore>11</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/queries/query-column/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>QueryColumn</code></span><span class="api-symbol-card__desc">Typed host buffers; validity and sparse error lanes preserve null/error distinctions.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-column-type/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>QueryColumnType</code></span><span class="api-symbol-card__desc">Physical column types; mixed columns use compact typed payload lanes.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-definition-result/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>QueryDefinitionResult</code></span><span class="api-symbol-card__desc">A definition the engine rejects, or the store's transaction result.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-fetch-result/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>QueryFetchResult</code></span><span class="api-symbol-card__desc">CSV and JSON sources return bytes; host sources return typed batches.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-fetch-source/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>QueryFetchSource</code></span><span class="api-symbol-card__desc">The only path to source data; the session never calls a global fetch.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-join-kind/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>QueryJoinKind</code></span><span class="api-symbol-card__desc">Join kinds retain duplicate matches and match null keys to null keys.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-output-block/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>QueryOutputBlock</code></span><span class="api-symbol-card__desc">Why an output table could not be written without touching unrelated cells.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-predicate/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>QueryPredicate</code></span><span class="api-symbol-card__desc">Data-only predicate trees use M null logic; only logical true selects a row.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-refresh-result/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>QueryRefreshResult</code></span><span class="api-symbol-card__desc">One refresh commits every requested output in one transaction, or none.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-source/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>QuerySource</code></span><span class="api-symbol-card__desc">Host-owned UTF-8 bytes are parsed against an explicit schema, without type guessing.</span></a>
<a class="api-symbol-card" href="/docs/api/queries/query-step/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>QueryStep</code></span><span class="api-symbol-card__desc">Saved step order is execution order; each column reference is a stable identity.</span></a>
</div>
