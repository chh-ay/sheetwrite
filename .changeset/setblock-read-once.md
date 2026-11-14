---
"@sheetwrite/core": patch
---

`grid.applyTransaction` reads each entry of a `setBlock`'s `values` and `styleIds` arrays once, by index, into a private copy that validation, the store, history, sync and the `change` event all use. An accessor entry in setBlock arrays is now read once instead of rejected, and a getter that throws gives a `SheetwriteError` with code `invalid-argument`. Holes, non-finite numbers, byte limits and every other check are unchanged. Admitting a 1,000,000-cell block no longer reads a property descriptor per cell.
