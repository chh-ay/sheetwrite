---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Column aggregates (`SheetwriteStore.aggregate`, the engine's `aggregate`) on dense sheets are fast again. Since the cell storage split, they read each cell through the general cell reader. On a 100,000-row column, SUM was 2.6× slower than in 0.5.0, and COUNT over mixed values was 6× slower. They now scan the column directly. Results do not change.
