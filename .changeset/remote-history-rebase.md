---
"@sheetwrite/core": patch
---

Keep undo and redo correct after remote row and column changes. `Grid.applyRemoteOperations`, which `SyncCoordinator` uses for every remote version, now moves undo and redo entries past remote row and column inserts and deletes, as local ones already did. Before, undoing a local edit after a collaborator inserted or deleted rows above it wrote the old value onto a different row and left the edit in place. An undo entry whose row a collaborator deleted no longer changes any other row.
