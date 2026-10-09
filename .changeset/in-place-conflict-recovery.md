---
"@sheetwrite/core": minor
---

Add `SyncCoordinator.recoverConflict()`. After a base-version conflict, it recovers on the live Grid without a reload when the pending work and the server versions it did not see change different cells and sheets, and neither side inserts, deletes, or moves rows or columns. It applies the missed server versions, moves the pending queue onto the server head, keeps undo history, and emits a `recovered` event; call `flush()` to resend. In every other case it returns `reload-required` with a `SyncConflictReloadReason` and changes nothing, so the host reloads as before.
