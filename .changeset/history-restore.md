---
"@sheetwrite/core": minor
---

Restore a history version on a live grid (#228). `HistoryArchive.restoreVersion(grid, versionId, scope, { sync, signal })` from `@sheetwrite/core/history` restores the whole workbook, one sheet or one range (`HistoryRestoreScope`) as one undoable change: one undo step, one `change` event with `commitReason: "restore"` and, with `sync`, one synchronized transaction, sent as an atomic batch when it needs more than one server version. A sheet keeps its ID and is resized in place at its end; a reference into removed rows or columns becomes `#REF!` and comes back on undo. Retained OOXML parts (`xlsxSource`) are not restored, as with undo. A shared document must be idle to restore; the pending commit carries `PendingCommit.restore` (`RestoreProvenance`), is never rebased, and on conflict `SyncCoordinator.recoverConflict()` returns `reload-required` with reason `restore`. A range that cuts a merged cell or hyperlink rejects with the new `HistoryError` code `invalid-scope`.

Removed: `RevisionCoordinator`, `RevisionAdapter`, `RevisionCoordinatorOptions`, `RevisionCoordinatorEvent`, `RevisionSummary`, `RevisionRestoreRequest` and `RevisionRestoreResponse`; use `HistoryArchive.listVersions`, `HistoryArchive.readVersion` and `HistoryArchive.restoreVersion` with a `HistoryStorageAdapter` instead.

Removed: the `revision-failed` error code and the `revision` error operation; history failures use `HistoryError` codes instead.
