---
"@sheetwrite/core": minor
---

`HistoryArchive.restoreVersion` compares the live cells with the version's and rewrites only the rows that differ, so restoring a version after a few edits is faster and makes a smaller undo step and synchronized transaction. When a sheet changes shape, the whole scope is rewritten as before. `HistoryRestoreOptions` gains `kernel`, where the history kernel's WASM comes from, as `HistoryDiffRequest.kernel`.
