---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
"@sheetwrite/core": patch
---

A row or column insert that a sheet cannot hold changes nothing. `addRows`, `removeRows`, `insertCols` and `removeCols` return `false` for a dense sheet that would pass its cell limit or a row count that overflows, and the store rejects the operation instead of moving formulas, charts or metadata for cells that did not move. `addPagedSheet` throws for a chunk size above 1048576 rows.
