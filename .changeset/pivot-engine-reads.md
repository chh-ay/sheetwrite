---
"@sheetwrite/core": patch
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

The pivot field list reads a field's distinct values from the engine in one call over the pivot's source rows, instead of reading the source column in windows. Dashboard pivot outputs and pivot source fields hand their buffers over instead of copying them. Results are unchanged.

- `CellStore.distinctValuesInRows(sheet, col, startRow, endRow, limit)` returns the distinct values of one column over a range of data rows.

Removed: `PivotOutput.kinds()`, `numbers()` and `texts()`; use `takeKinds()`, `takeNumbers()` and `takeTexts()` instead.
Removed: `PivotFields.names()` and `types()`; use `takeNames()` and `takeTypes()` instead.
