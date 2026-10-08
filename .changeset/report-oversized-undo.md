---
"@sheetwrite/core": patch
---

Report an undo that is too large instead of failing silently. When the data that an undo restores is above the transaction limits (`maxEncodedBytes` or `maxOperations`), `grid.undo()` changes nothing. The Grid now emits `mutation-rejected` with the `resource-limit` issue and removes that entry from the undo history, so older edits can still be undone. Before, the Grid sent no event and kept the entry, so every later undo failed the same way. Large restores first use the compact `restoreBlock` encoding and atomic batches, so this applies only to an undo that still exceeds those ceilings.
