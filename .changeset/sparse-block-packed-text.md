---
"@sheetwrite/core": patch
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Snapshot hydration, datasource pages and transaction writes pass a block's text cells to the engine as one UTF-8 buffer instead of one JavaScript string per cell. Results are unchanged.

Removed: the `texts: string[]` argument of `CellStore.setSparseBlock`; pass `textBuf` and `textOffsets`, as `setBlockPacked` takes them, instead.
