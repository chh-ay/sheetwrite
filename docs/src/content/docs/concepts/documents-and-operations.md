---
title: Documents and operations
description: Understand authoritative workbook snapshots, document operations, storage transactions, and cell inputs.
---

## Document protocol and storage transactions

`WorkbookSnapshot` is the versioned, JSON-safe authoritative document. Schema 1
contains sheet order and identity, stable column keys, literal/formula/reference
cell inputs, sparse styles and row metadata, merges, frozen panes, conditional
formats, validation rules, protected ranges, notes, row groups, hidden document
metadata, filters, sort keys, and named ranges. Workbook calculation settings
and retained opaque XLSX source data also travel with the snapshot when present.
Formula source is authoritative; resolved values are derived caches and are not
serialized.

`DocumentOp` is the exhaustive plain-data mutation vocabulary for that document.
Cells, ranges, rows/columns, merges, row metadata, frozen panes, conditional
formats, validation, protection, notes, row groups, named ranges, workbook
calculation settings, and sheet lifecycle operations use the same store reducer
and change-event shape. Local
operations submitted through `Grid` enter grid undo/redo history;
`SyncCoordinator` observes each non-empty local transaction and owns its durable
mutation-ID record. Direct `Store.applyTransaction` calls deliberately bypass
grid read-only/history policy. Remote operations remain observable with
`source: "remote"` but enter neither local history nor outgoing synchronization.

```ts prelude="architecture" partial="requires surrounding host state" title="Partial example"
const checked = validateWorkbookSnapshot(JSON.parse(payload));
if (!checked.ok) throw new Error(checked.errors[0]?.message);

const outcome = grid.store.applyTransaction({
  patches: [
    {
      op: "set",
      addr,
      value: { kind: "literal", value: "authoritative input" },
      style: { backgroundColor: "#fde68a" },
    },
  ],
});
```

Snapshot hydration is a separate, validated path: it creates every sheet handle,
bulk-loads literal runs, installs formula/reference/style exceptions, then
recomputes after the complete graph exists. It emits no user event, dirty patch,
or undo entry. Export uses one bulk data-order read per sheet, ignores local
sort/filter views and conditional render styles, and emits deterministic sparse
blocks.

```ts prelude="collaboration" partial="requires surrounding host state" title="Partial example"
const saved = await adapter.load(documentId, signal);
const grid = createGridFromSnapshot(host, saved);
const sync = new SyncCoordinator(grid, adapter, {
  documentId,
  serverVersion: saved.version ?? 0,
});

await sync.ready();
const unsubscribeRemote = sync.subscribe(remoteOperationSource);
await sync.sendNext(); // host chooses send/retry timing
```

Each local grid transaction becomes one immutable `PendingCommit` with a stable
`clientMutationId` and explicit `baseVersion`. Records move from `pending` to
`sending`; an applied or duplicate response acknowledges store dirty state and
removes only the matching ID. Transport failure returns that record to `pending`,
so retry sends the same ID. A conflict remains `conflicted` with its local
operations intact and exposes server operations or a snapshot; Sheetwrite does
not silently merge ambiguous structural edits. See
[Collaboration and offline work](/docs/features/collaboration/) for durable storage, recovery,
presence, comments, revisions, and the conservative rebase gate.

Remote operations must arrive at exactly `serverVersion + 1`. Older versions and
known mutation echoes are idempotently ignored; a gap emits `reload-required`
instead of guessing. Canonical server operations apply with source `remote`, so
they repaint/recompute without entering the outgoing queue.

Document state does **not** include selection, scroll position, editor/caret
state, search results, temporary highlights, renderer choice, read-only policy,
or local zoom. Those are session state. `Workbook.activeSheet` remains document
metadata in schema 1.

Validation and protection run at the shared local transaction boundary, not only
inside the inline editor. Validation policies can reject atomically, apply with a
warning, or allow input. Protected ranges deny local writes unless the host's
`ProtectionResolver` allows them; the default is deny. `atomic` mode rejects a
transaction containing any denied operation, while `partial` mode filters denied
operations and reports them in `rejections`. Protection is client UX policy, not
server authorization. Remote operations intentionally bypass local protection.

Applied storage transactions emit `change` with the filtered transaction,
per-cell rollback data, accumulated dirty patches, epoch, commit reason, and an
explicit `source` (`local` or `remote`). Remote operations still update formulas
and rendering, but do not re-enter outgoing persistence. Conflicts and no-ops
return explicit outcomes rather than throwing.

Sheet IDs remain stable across rename and reorder. Renaming rewrites canonical
cross-sheet formula source while preserving the stable formula-engine handle.
Removing a referenced sheet rewrites dependents to `#REF!`; undo restores the
sheet snapshot, formulas, styles, metadata, and dependencies. Removing the active
sheet selects the nearest surviving sheet. The final sheet cannot be removed.
All public document actions, including custom calls through `grid.actions`, are
no-ops when the grid is read-only.

### Cell values

A cell value is one of three shapes:

```ts prelude="architecture" partial="requires surrounding host state" title="Partial example"
type CellValue =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "ref"; target: CellAddress } // a plain cross-reference
  | { kind: "formula"; src: string }; // authoritative source; "=" is optional at storage
```
