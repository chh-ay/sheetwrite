---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

The engine exports 10 fewer `CellStore` methods. Sheetwrite did not call them, so the grid and store APIs do not change. Removed: `canDirtyCell`, `dirtyRevision`, `markCellCleanRevision`, `hydratePageNumbers`, `hydratePageStringsPacked`, `spillOwnerCoordinates`, `isSheetAlive`, `pinRange`, `styleIdAt` and `sortRows`. If you call the engine directly, use `sortRowsMulti` with one key instead of `sortRows`, `getCell(...).style` instead of `styleIdAt`, and `setSparseBlock` inside `beginPageLoad`/`commitSources` instead of `hydratePage*`. Paged sheets no longer keep caller-owned `pinRange` pins. Viewport and read-window pins work as before.
