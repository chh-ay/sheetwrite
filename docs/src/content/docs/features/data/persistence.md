---
title: Persistence and recovery
description: Persist versioned snapshots and durable pending mutations without confusing session state with document state.
---

```ts prelude="collaboration" partial="requires a persistence adapter" title="Load, mount, and queue"
const loaded = validateWorkbookSnapshot(await (await fetch("/documents/products")).json());
if (!loaded.ok) throw new Error(`Invalid snapshot: ${loaded.errors.length} error(s)`);

const grid = createGridFromSnapshot(host, loaded.value);
const sync = new SyncCoordinator(grid, adapter, {
  documentId: "products",
  serverVersion: loaded.value.version ?? 0,
});

saveButton.onclick = () => void sync.sendNext();
```

<div class="sw-grid-result" data-caption="Result: restored Products snapshot, with no local edits queued">

| Notebook | 3 | 8 | **$24.00** |
| --- | --- | --- | --- |
| Pen | 5 | 2 | **$10.00** |

</div>

| Snapshot / session state | Immediately after opening this example |
| --- | --- |
| Loaded document | `products`, version `7` (the example response's `version`) |
| Restored cells | A1:C2 contain the product inputs shown above. D1 and D2 retain `=B1*C1` and `=B2*C2`, with bold currency formatting. |
| Outgoing queue | Empty: hydration creates no local change event or undo entry. |
| Next local edit | Queued until the host calls `sync.sendNext()`, here through the Save button. |

This preview assumes `/documents/products` returns a valid snapshot at version `7` containing those cells and styles. It is not a built-in endpoint or a save acknowledgement: mounting a snapshot does not prove that a later edit has been persisted.

**Try it live:** [Database showcase](/showcases/database/) — edit cells, hold commits, and reload to inspect recovery. The showcase uses IndexedDB in your browser, not your server.

**Full setup:** use the host and initialization from [Your first grid](/docs/start/first-grid/), then the [complete HTTP adapter and load/mount flow](/docs/features/collaboration/#load-mount-queue-and-acknowledge). You supply `adapter`, the document endpoint, and `saveButton`; `serverVersion` must come from the loaded snapshot.

Sheetwrite supplies contracts, not a database or endpoint. A `PersistenceAdapter` loads a schema-versioned `WorkbookSnapshot` and commits immutable `PendingCommit` records carrying a stable `clientMutationId` and `baseVersion`.

## What your host implements

| Part | You provide | Sheetwrite provides |
| --- | --- | --- |
| Load | `PersistenceAdapter.load` returns a validated `WorkbookSnapshot` with its `version`. | `createGridFromSnapshot`, `validateWorkbookSnapshot` |
| Save | `PersistenceAdapter.commit` appends one version in one database transaction. | `SyncCoordinator` queues, sends, and acknowledges commits in order. |
| Large undo | `restoreBlock` in your operation handler. Optional: `PersistenceAdapter.commitBatch`. | The Grid encodes large restores and, if needed, splits them into atomic batches. |
| Offline work | Nothing, in the browser. | `IndexedDbPendingCommitStorage` keeps pending commits across reloads. |
| Conflicts | A recovery UX for conflicts that rebase cannot resolve. | Conservative rebase and typed conflict events. |

The [collaboration guide](/docs/features/collaboration/#load-mount-queue-and-acknowledge) has a complete HTTP adapter, the server table design, and the commit steps.

A commit response is `applied`, `duplicate`, or `conflict`. Applied and duplicate acknowledgements advance the server version. A conflict may provide ordered operations since the base or a current snapshot. Ambiguous structural or formula conflicts require host UX rather than silent merge.

`IndexedDbPendingCommitStorage` from `@sheetwrite/core/browser` can retain optimistic work across reloads. Its typed errors report blocked upgrades, unsupported schemas, quota, transaction, and abort failures. The core continues without durable browser storage when no pending-storage adapter is supplied.

## Serializable documents

Use `WorkbookSnapshot` plus `validateWorkbookSnapshot()` at persistence boundaries. `schemaVersion: 1` rejects unsupported future schemas with structured errors. `DocumentOp` is the exhaustive reducer operation union, including metadata and sheet lifecycle operations.

| Call | Behavior |
| --- | --- |
| `createGridFromSnapshot(host, snapshot, options)` | Validates and hydrates every sheet before mounting. Hydration emits no change event or undo entry. |
| `grid.exportSnapshot()` | Uses bulk sheet reads and returns deterministic sparse blocks. |
| `grid.applyRemoteOperations(operations)` | Emits a change with `source: "remote"`. It stays outside local undo history and outside `SyncCoordinator`'s outgoing queue. |
| `new SyncCoordinator(grid, adapter, options)` | Queues each non-empty local transaction as an immutable mutation record. Its `serverVersion` option is required and should come from the loaded snapshot. |
| `sync.sendNext()` / `sync.retry(id)` | Host-controlled sends. Retries keep the original ID. |
| `sync.subscribe(source)` | Accepts a transport-neutral callback source and validates strict version order. |

Use `MemoryPersistenceAdapter` as an executable, server-sequenced reference, not as durable storage. Adapter methods accept `AbortSignal`. Transport failures use `PersistenceError`, while version conflicts are typed commit responses that keep local work.

### Document state and session state

Document snapshots include workbook and sheet data, formula source, formatting, validation, protection metadata, notes, names, filters, and related document state.

Session state never belongs in a snapshot: selection, scroll position, caret state, search overlays and temporary highlights, host read-only policy, local zoom, and session-only grid options such as `renderer` and `readOnly`.

## Opt-in version archives

Import `HistoryArchive` and `MemoryHistoryStorage` from `@sheetwrite/core/history`.
For durable browser storage, import `IndexedDbHistoryStorage` from
`@sheetwrite/core/browser/history`. Neither entrypoint is loaded by a normal grid.
The archive is a headless storage module. It does not add grid commands.

Open an archive with a stable `documentId` and storage adapter. Call `initialize`
once with a fully loaded, committed `WorkbookSnapshot` and its creation time.
On restart, `HistoryArchive.open` reads only the durable recorder cursor.

Pass each **committed**, ordered transaction to `record`. A `CommittedTransaction` carries
`baseRevision`, `revision`, `mutationId`, `authorId`, `time`, and `operations`.
Do not record optimistic grid change events. The document authority must confirm
the revision and author first. `HistoryArchive` implements `CommitJournal`, so the
reference `MemoryPersistenceAdapter.recordHistory` can record each commit as part of
it; see [Authors and version history](/docs/features/collaboration/#authors-and-version-history)
for the server contract. This module does not replace `SyncCoordinator` or the
durable pending queue.

The second argument to `record` is a snapshot provider. It runs only when a
checkpoint is due. It must return the complete committed document at the incoming
revision, including matching `documentId` and `version`. A grid snapshot still
needs its confirmed persistence revision attached by the host.

| Archive call | Behavior |
| --- | --- |
| `initialize(snapshot, time, signal?)` | Atomically publish the initial checkpoint. |
| `record(commit, captureSnapshot?, signal?)` | Append one confirmed transaction; create a checkpoint and automatic marker when due. |
| `saveVersion(name, authorId, time, signal?)` | Name the durable head without copying the workbook. Flush pending edits before calling it. |
| `listVersions({ maxEntries?, maxBytes?, cursor?, signal? })` | Read bounded metadata, newest first. A new publication invalidates an old cursor. |
| `readVersion(id, signal?)` | Rebuild the document of one version. When the version has log entries after its checkpoint, replay runs in a separate engine instance that is retired before the call returns or rejects, so the document engine's memory does not grow. Starting that instance reuses the compiled module. |
| `diffVersions({ from, to, cursor?, maxEntries?, signal?, kernel? })` | One page of the changes between two versions; see [Compare versions](#compare-versions). |
| `prune({ beforeTime?, targetBytes?, signal? })` | Remove eligible automatic markers and unreachable records. Keep named markers. |
| `deleteVersion(id, signal?)` | Explicitly remove one marker. Keep chunks another version or reader still needs. |
| `storageUsage(signal?)` | Read retained encoded bytes and record/marker counts. This is not a JS heap estimate. |

### Chunks and limits

Checkpoints contain references to per-sheet records, fixed **16-row by 4-column**
cell pages, and separate metadata blocks. Large metadata arrays use 128-entry
blocks. Content IDs include the schema, encoding, references, and compressed
payload. Unchanged pages are shared across checkpoints. SHA-256 verification and
bounded inflate run before replay.

An automatic marker is made after five active minutes with committed edits. Each
marker keeps the checkpoints made since the marker before it, so the log between two
retained versions stays readable for a diff.
A checkpoint is due after 30 active minutes, 1,000 transactions, or 2 MiB of log.
No history timer or workbook-sized version cache runs in the background.

The defaults are a 64 MiB encoded snapshot ceiling, 1 MiB decoded log segments,
64 MiB per atomic transaction, a 256 MiB working-set reservation, and 512 MiB
retained storage per document. Snapshot capture uses a conservative reservation
in addition to its encoded limit, so a large snapshot can reach the working-set
limit first. Metadata pages contain at most 100 entries or 256 KiB. An atomic
transaction can cross log segments, but replay never exposes a partial transaction.

Automatic markers have a 30-day age ceiling and can expire earlier to meet the
storage cap. Up to 100 named markers stay pinned until explicitly deleted.
Pinned data or the current head exceeding capacity makes archiving fail; it does
not delete named versions or discard pending document edits. The host can override
storage, cadence, and retention limits through `HistoryArchiveOptions.limits`.

### Implement a history storage adapter

`HistoryStorageAdapter` has four asynchronous methods: `put`, `get`, `list`, and
`prune`. Every request includes document identity, resolved ceilings, and an
optional `AbortSignal`.

- `put` publishes immutable chunk records, a head, and an optional marker in one
  transaction. Compare `expectedGeneration` before any publication. Dependencies
  precede their owners. A reader can also acquire or release a short-lived pin.
- `get` returns a manifest, marker, or bounded payload. A pinned record read
  renews its five-minute lease. Expired leases fail rather than read pruned data.
- `list` returns bounded marker metadata, filtered by revision interval, or
  metadata for a selected record kind. It never returns cell payloads.
- `prune` compares the expected generation, removes eligible markers, and deletes
  records only when no head, marker, record, or active reader refers to them.

Keep document commit and history journaling in one host database transaction or
a durable transactional outbox when collaboration is connected. An in-page event
listener alone is not a durable journal. The supplied memory adapter is session
storage; the IndexedDB adapter uses atomic database transactions and closes its
database connection after each request.

`HistoryError` extends `SheetwriteError`. Its stable codes distinguish invalid
history, an invalid restore scope, generation conflicts, capacity, missing records,
integrity, unavailable storage, blocked database open, and transaction failures. An abort rejects with
the caller's `signal.reason`. It never publishes a partial marker.

### Restore a version

`archive.restoreVersion(grid, versionId, scope, { sync, signal })` brings back part or
all of a version on a live grid as **one undoable change**: one undo step, one `change`
event with `commitReason: "restore"`, and, with `sync`, one synchronized transaction.
The version is rebuilt in a separate engine instance. Sheet and workbook settings are
compared and only the changed ones are written; the cells of the scope are cleared and
written again from the version. All of it uses ordinary document operations, so the
undo step and the synchronized transaction grow with the size of the scope.

| Scope | Restores | Keeps current |
| --- | --- | --- |
| `{ kind: "workbook" }` | Every sheet (re-creating removed sheets with their IDs and removing later ones), sheet order, names, table relationships, calculation options | Retained OOXML parts (`xlsxSource`), as undo does |
| `{ kind: "sheet", sheet }` | That sheet's name, size, columns, cells, styles, notes, merges, rules, hyperlinks, protected ranges, row metadata, frozen panes, tables, charts and pivots; a removed sheet comes back with its ID | Other sheets, workbook names |
| `{ kind: "range", range }` | Values, formulas, styles, notes, and merged cells and hyperlinks inside the range | Sheet size, rules, tables, charts, pivots, everything outside the range |

A sheet keeps its ID, so formulas on other sheets keep their references. When a
sheet was smaller in the version, its last rows or columns are deleted: as with a
manual delete, a reference into those rows becomes `#REF!`, and undoing the restore
brings the rows and the references back. A range restore rejects with `invalid-scope`
when the range cuts a merged cell or hyperlink, now or in the version; the message
names the object's rows and columns, so the user can widen the range.

In a shared document, pass the grid's `SyncCoordinator`. The restore needs it online
with no pending or conflicted commits, and rejects with `conflict` if the document
changes while the version is read. A restore commit is never rebased; see
[Restoring versions](/docs/features/collaboration/#restoring-versions).

### Compare versions

`archive.diffVersions({ from, to })` returns one page of the changes from an earlier
version to a later one. Both versions are rebuilt in private engine instances and
compared in windows of at most 65,536 cells by a small, history-only WASM kernel
(`@sheetwrite/wasm/history`, about 17 KB gzip). The kernel has no formula engine. It
loads the first time a diff runs, so a grid that never compares versions downloads
nothing for it. Pass `kernel` to load its WASM from a URL your bundler emitted for
`@sheetwrite/wasm/history/wasm`.

| Page field | Contents |
| --- | --- |
| `cells` | Changed cells as typed columns: `sheet` (index into `sheetIds`), `row`, `col`, `beforeRow`, `beforeCol`, `flags` and `author` (index into `authors`). |
| `details` | Before and after of each changed cell (value, formula source, style) and every person who wrote it between the versions. |
| `sheets` | Sheets that were added, removed, or changed outside their cells, with the changed fields (for example `name`, `rowCount` or `merges`) and the last person who changed them. |
| `workbook` | Workbook fields that changed, such as `namedRanges` or `calculation`. |
| `cursor` | Present when more changes follow. Pass it back to read the next page. |

`flags` combines the `HistoryDiffFlag` bits `value`, `formula`, `style`, `added` and
`removed`. Sources are compared, not calculated values: a formula whose result changed
but whose source did not is not a change. Styles are compared by content.

Rows and columns are aligned through the structural operations of the log, so an
inserted, removed or moved row does not make the rows below it changed. `beforeRow` and
`beforeCol` give the position of a cell in the earlier version, or `HISTORY_DIFF_NONE`
on a row or column that was added. A sorted range (`permuteRows`) is compared by
position, so its moved cells show as changed. Each change names the last person whose
logged write reached the cell; the write follows the cell through inserted and removed
rows. When a change is older than the retained log, or a version between the two was
deleted, `author` is `HISTORY_DIFF_NONE` and `logComplete` is `false`.

A page holds at most 1,000 changes (`maxEntries`). Nothing is kept between pages: each
request rebuilds both versions and continues from `cursor`, so a closed or aborted diff
holds no memory.

## Large undo

Undo of a large clear can be larger than one transaction allows. Sheetwrite 0.5.0 sends such a restore as one compressed `restoreBlock` operation. Your server must accept that operation before it accepts 0.5.0 clients. When even the compressed restore needs more than one server version, the Grid uses an atomic batch, which needs `commitBatch`. Without `commitBatch`, only that undo is rejected; everything else works. See [Large undo and atomic batches](/docs/features/collaboration/#large-undo-and-atomic-batches).

## Edge cases and limits

- A local commit costs the same at any offline queue depth. `SyncCoordinator` does not walk every pending commit to pick a base version or report its state.
- Remote operations never enter the outgoing queue, so they are not sent back.
- Version conflicts keep local work; recover them with host UX.

## See also

- [Collaboration and conservative rebase](/docs/features/collaboration/)
- [Events → Sync coordinator events](/docs/reference/events/#sync-coordinator-events)
- [Document operations reference](/docs/reference/document-operations/)
- [`PersistenceAdapter` and sync API](/docs/api/core/persistence-adapter/)
- [`@sheetwrite/core/browser`](/docs/api/core-browser/)
- [Database showcase](/showcases/database/): IndexedDB persistence, reload recovery, and compaction, live.
