---
title: Error handling
description: Typed failures, stable codes, recovery paths, event direction, validation, and incomplete-data behavior.
---

See [Event direction](/docs/reference/events/#event-direction) for committed
transaction sources and framework readiness events.


## Stable failure envelope

Every consumer-visible failure of Sheetwrite is a `SheetwriteError`: bad
input, a limit that is passed, and failures of initialization, datasources,
the renderer, export, persistence, snapshots, synchronization, collaboration,
CSV and XLSX. Use `code` and `operation` for control flow; `message` is
diagnostic text and may become more specific. `context` contains
serialization-safe identifiers and numbers, `retryable` is present only when
Sheetwrite can determine it, and `cause` retains the original exception in the
current realm. `toJSON()` omits `cause`. Only a bug in Sheetwrite itself
throws a plain `Error`.

A failure stays small, whatever data the operation held. The message is cut
to 8 KiB of UTF-8, and so is the sum of the strings in `context`; a cut keeps
the start and the end of the text. A `context` with more than 1,024 entries
becomes `{ truncated: true }`.

```ts prelude="wasm" partial="requires application-specific WASM URLs" title="Initialization recovery"
import { initSheetwrite, isSheetwriteError } from "@sheetwrite/core";
declare const wasmUrl: URL;
declare const correctedWasmUrl: URL;
declare function showInitializationError(message: string): void;


try {
  await initSheetwrite(wasmUrl);
} catch (error) {
  if (!isSheetwriteError(error) || error.code !== "initialization-failed") throw error;
  showInitializationError(error.message);
  // A failed source does not poison readiness. Retry with corrected input.
  await initSheetwrite(correctedWasmUrl);
}
```

The guard checks the shape only: a string `name` and `message`, a non-empty
string `code` and `operation`, and a JSON-safe `context` when present. It
accepts cross-realm errors and serialized envelopes, and it does not compare
`code` with a list, so a code from a newer release passes. Give a `switch` on
`error.code` a `default` branch. A serialized envelope is structural; code
that requires `Error` identity should construct or receive a live
`SheetwriteError`.

```ts prelude="wasm" partial="requires surrounding host state" title="Operational recovery"
declare function retryVisibleRows(request: {
  readonly sheet: string;
  readonly start: number;
  readonly end: number;
  readonly revision: number;
}): void;
declare function reportDegradedRendering(code: string): void;
declare function promptToEnableXlsx(): void;

grid.on("datasource-error", ({ request, error }) => {
  if (error.retryable !== false) {
    retryVisibleRows(request);
  }
});

grid.on("renderer-fallback", ({ error }) => {
  reportDegradedRendering(error.code);
  // Canvas rendering is already active; do not remount the Grid.
});

grid.on("export-error", ({ error }) => {
  if (error.code === "optional-backend-unavailable") {
    promptToEnableXlsx();
  }
});
```

Framework initialization callbacks and Grid operational events carry the same
class identity exported by `@sheetwrite/core` and `@sheetwrite/core/adapter`.
Normal mutation denials remain `mutation-rejected` results/events, and
incomplete paged queries retain their explicit capability/result contracts;
they are not converted into generic exceptions.

## Typed error index

Start with [`SheetwriteError`](/docs/api/core/sheetwrite-error/) and
[`isSheetwriteError`](/docs/api/core/is-sheetwrite-error/). Branch on the stable
`code` and `operation` fields; use the boundary-specific classes below only when
their structured fields are needed.

The complete enums are [`SheetwriteErrorCode`](/docs/api/core/sheetwrite-error-code/)
and [`SheetwriteErrorOperation`](/docs/api/core/sheetwrite-error-operation/).
[`SHEETWRITE_ERROR_CODES`](/docs/api/core/sheetwrite-error-codes/) and
[`SHEETWRITE_ERROR_OPERATIONS`](/docs/api/core/sheetwrite-error-operations/)
list the same values at run time; Sheetwrite does not read them, so a bundle
that does not import them does not contain them.

Bad host input that has no boundary class has the code `invalid-argument`:
simple columns (`create-grid`), row bridge options and row IDs
(`row-bridge`), a custom `CellRenderer.dom()` result (`render`), store options
(`store`) and resource reports (`resource-diagnostics`). A sheet ID that no
sheet has is `not-found` with operation `store` and `context.sheet`. A limit
override that is not a valid number is `invalid-limits` for transactions,
snapshots, synchronization and IndexedDB loads.

<div class="error-catalog">
<a href="/docs/api/core/snapshot-validation-error/"><code>SnapshotValidationError</code><span>Malformed workbook snapshot; inspect path-qualified <code>errors</code>.</span></a>
<a href="/docs/api/core/snapshot-resource-error/"><code>SnapshotResourceError</code><span>Workbook construction exceeded a configured resource ceiling.</span></a>
<a href="/docs/api/core/incomplete-data-error/"><code>IncompleteDataError</code><span>A query needs datasource pages that are not loaded yet.</span></a>
<a href="/docs/api/core/delimited-text-options-error/"><code>DelimitedTextOptionsError</code><span>A CSV/TSV resource-limit option is invalid.</span></a>
<a href="/docs/api/core/delimited-text-resource-error/"><code>DelimitedTextResourceError</code><span>CSV/TSV parsing or encoding exceeded a declared limit.</span></a>
<a href="/docs/api/core/xlsx-resource-error/"><code>XlsxResourceError</code><span>XLSX import or export exceeded a codec resource ceiling.</span></a>
<a href="/docs/api/core/persistence-error/"><code>PersistenceError</code><span>Host load, commit, or recovery failed with a stable persistence code.</span></a>
<a href="/docs/api/core-browser/indexed-db-pending-commit-storage-error/"><code>IndexedDbPendingCommitStorageError</code><span>Browser durable-queue storage is unavailable, blocked, aborted, corrupt, or over quota.</span></a>
<a href="/docs/api/core/sync-protocol-error/"><code>SyncProtocolError</code><span>Remote synchronization input is malformed or exceeds a protocol bound.</span></a>
<a href="/docs/api/core/sync-pending-capacity-error/"><code>SyncPendingCapacityError</code><span>The durable local queue cannot reserve capacity for another transaction.</span></a>
</div>

## Recovery by boundary

- `SnapshotValidationError` rejects malformed workbooks before partial hydration. Inspect its path-qualified `errors`; fix or reject the source instead of retrying unchanged bytes.
- `SnapshotResourceError` reports bounded workbook construction. Reduce the document or explicitly raise the named host-controlled ceiling.
- `DelimitedTextOptionsError` rejects an invalid CSV/TSV ceiling before work starts. Correct the option; retrying the same configuration cannot succeed.
- `DelimitedTextResourceError` and `XlsxResourceError` retain `resource`, `limit`, and `actual`. Reduce the input/output or explicitly change the applicable limit.
- `IncompleteDataError` identifies datasource pages required by the operation. Load those pages or use a visible-window operation; do not treat unloaded cells as empty.
- `PersistenceError` retains the host load/commit `cause`; its code distinguishes aborted work, invalid snapshots, resource limits, missing state, and rejected commits.
- `IndexedDbPendingCommitStorageError` distinguishes unavailable, blocked, aborted, corrupt, and quota-limited browser storage.
- `SyncProtocolError` rejects malformed or resource-violating remote input. Fix the producer; do not replay the same payload.
- `SyncPendingCapacityError` rejects a new local transaction before it can exceed the durable queue ceiling. Drain or reconcile pending work before retrying.

Worker failures switch to the canvas renderer and emit `renderer-fallback`; observe `grid.rendererKind` to report the active renderer, not the requested option. `error.context.failure` tells why the worker stopped: `spawn` (the script did not load or start), `crash` (an uncaught error after start), `protocol` (a message that one side cannot read, for example a `workerUrl` copy from another release), `timeout` (no `ready` reply in 10 seconds) or `fatal` (the worker lost its 2D context). The worker requests do not return promises, so no request stays pending after a failure or `destroy()`.

## Engine failure

A WASM trap, for example `RuntimeError: unreachable` after an internal engine
panic, leaves the engine instance half-written. Sheetwrite never calls that
instance again:

- The call that trapped throws a `SheetwriteError` with code `engine-failed` and operation `engine`. Its `cause` is the trap.
- Every grid on that instance emits `engine-failed` once. It keeps its last frame, becomes read-only and does not read its store again. `setReadOnly(false)` does not undo this.
- Every store on that instance throws `engine-failed` from `applyTransaction`, `recalculateVolatile` and `loadPage`. `isSheetwriteReady()` returns `false`.
- A trap while `releaseEngineMemory()` prepares its copy also stops the engine, because the trap can come from the live instance.

To continue, destroy the grid, call `initSheetwrite()` again and create a new
grid from a document that you saved, for example through persistence or sync.
The restart uses the same compiled module and does not download it again. Do
not read the failed grid or store to get the document: its engine state is not
reliable.

```ts prelude="wasm" partial="requires surrounding host state" title="Restart after an engine failure"
import {
  createGridFromSnapshot,
  type Grid,
  initSheetwrite,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
declare const host: HTMLElement;
declare function lastSavedSnapshot(): Promise<WorkbookSnapshot>;
declare function useGrid(next: Grid): void;
declare function reportEngineFailure(code: string): void;

grid.on("engine-failed", async ({ error }) => {
  reportEngineFailure(error.code);
  grid.destroy();
  await initSheetwrite();
  useGrid(createGridFromSnapshot(host, await lastSavedSnapshot()));
});
```

- [`GridEvents`](/docs/api/core/grid-events/)
- [`SnapshotValidationError`](/docs/api/core/snapshot-validation-error/)
- [`IncompleteDataError`](/docs/api/core/incomplete-data-error/)
- [`SheetwriteError`](/docs/api/core/sheetwrite-error/)
- [`isSheetwriteError`](/docs/api/core/is-sheetwrite-error/)
- [Framework lifecycle](/docs/frameworks/lifecycle/)
