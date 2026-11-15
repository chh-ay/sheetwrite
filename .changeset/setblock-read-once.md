---
"@sheetwrite/core": patch
---

`grid.applyTransaction`, `grid.applyRemoteOperations` and `SheetwriteStore.applyTransaction` read each entry of a `setBlock` operation's `block.values` and `block.styleIds` arrays once, by index, into a private copy that validation, the store, history, sync and the `change` event all use. An accessor entry in those two arrays is now read once instead of rejected, and a getter that throws gives a `SheetwriteError` with code `invalid-argument`. Nothing else changes: every other `setBlock` field (including `range`, `formulas`, `refs` and `styleTable`), every other operation type, holes, non-finite numbers and byte limits keep today's validation, and getters there are still rejected without running. Admitting a 1,000,000-cell block no longer reads a property descriptor per cell.
