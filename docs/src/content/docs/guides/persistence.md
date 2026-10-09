---
title: Persistence and recovery
description: Persist versioned snapshots and durable pending mutations without confusing session state with document state.
---

Sheetwrite supplies contracts, not a database or endpoint. A `PersistenceAdapter` loads a schema-versioned `WorkbookSnapshot` and commits immutable `PendingCommit` records carrying a stable `clientMutationId` and `baseVersion`.

A commit response is `applied`, `duplicate`, or `conflict`. Applied and duplicate acknowledgements advance the server version. A conflict may provide ordered operations since the base or a current snapshot; ambiguous structural or formula conflicts require host UX rather than silent merge.

`IndexedDbPendingCommitStorage` from `@sheetwrite/core/browser` can retain optimistic work across reloads. Its typed errors report blocked upgrades, unsupported schemas, quota, transaction, and abort failures. The core continues without durable browser storage when no pending-storage adapter is supplied.

Document snapshots include workbook/sheet data, formula source, formatting, validation, protection metadata, notes, names, filters, and related document state. Selection, scroll position, caret state, search overlays, host read-only policy, and local zoom remain session state.

## What your host implements

| Part | You provide | Sheetwrite provides |
| --- | --- | --- |
| Load | `PersistenceAdapter.load` returns a validated `WorkbookSnapshot` with its `version`. | `createGridFromSnapshot`, `validateWorkbookSnapshot` |
| Save | `PersistenceAdapter.commit` appends one version in one database transaction. | `SyncCoordinator` queues, sends, and acknowledges commits in order. |
| Large undo | `restoreBlock` in your operation handler. Optional: `PersistenceAdapter.commitBatch`. | The Grid encodes large restores and, if needed, splits them into atomic batches. |
| Offline work | Nothing, in the browser. | `IndexedDbPendingCommitStorage` keeps pending commits across reloads. |
| Conflicts | A recovery UX for conflicts that rebase cannot resolve. | Conservative rebase and typed conflict events. |

The [collaboration guide](/docs/guides/collaboration/#load-mount-queue-and-acknowledge) has a complete HTTP adapter, the server table design, and the commit steps.

## Large undo

Undo of a large clear can be larger than one transaction allows. Sheetwrite 0.5.0 sends such a restore as one compressed `restoreBlock` operation. Your server must accept that operation before it accepts 0.5.0 clients. When even the compressed restore needs more than one server version, the Grid uses an atomic batch, which needs `commitBatch`. Without `commitBatch`, only that undo is rejected; everything else works. See [Large undo and atomic batches](/docs/guides/collaboration/#large-undo-and-atomic-batches).

## See also

- [Collaboration and conservative rebase](/docs/guides/collaboration/)
- [Document operations reference](/docs/reference/document-operations/)
- [`PersistenceAdapter` and sync API](/docs/api/core/persistence-adapter/)
- [`@sheetwrite/core/browser`](/docs/api/core-browser/)
- [Database showcase](/showcases/database/): IndexedDB persistence, reload recovery, and compaction, live.
