---
"@sheetwrite/core": patch
---

Make each local commit cost the same at any offline queue depth. `SyncCoordinator` no longer walks every pending commit to pick a base version or report its state, so 10,000 queued edits no longer slow the next one down.
