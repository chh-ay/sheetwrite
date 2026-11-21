---
"@sheetwrite/core": patch
---

`HistoryArchive.diffVersions` reads and rebuilds only the checkpoint pages that can differ between the two versions, so a small change of a large workbook compares in a fraction of a second instead of rebuilding both versions whole (100,000 rows × 4 columns on Linux: 10 changed cells 7.6 s → 0.33 s, 1,000 changed rows 7.9 s → 1.7 s). Pages are matched by content ID through the log's row and column alignment. The result is the same as before. Both versions are still rebuilt whole when a version's log tail holds a structural or other non-cell operation, or when more than a quarter of the pages differ.
