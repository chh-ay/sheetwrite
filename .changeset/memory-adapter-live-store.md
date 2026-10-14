---
"@sheetwrite/core": patch
---

`MemoryPersistenceAdapter` commits are faster on large documents. Each document keeps one live store, so a commit applies its transaction instead of rebuilding the whole workbook from a snapshot, re-exporting it and copying it. With a 110,000-cell document, a one-cell commit no longer blocks for about 450 ms. `load` and conflict responses export a fresh snapshot on demand. A rejected or aborted commit, including a failed member of an atomic batch, still leaves the document unchanged.
