---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Add explicit `releaseEngineMemory()` to move all live core stores into a fresh WASM instance and release the old engine's peak memory. Preserve cached formula results, resident datasource pages, unsaved edits, and compact undo/redo history together. Failed preparation leaves every store on the original instance.

Both engine loaders can create independently collectible instances from shared compiled code. Existing singleton `load()` and `initSync()` calls continue to work.
