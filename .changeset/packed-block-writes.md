---
"@sheetwrite/wasm": minor
"@sheetwrite/core": patch
---

Faster bulk loading through packed block writes.

- **Breaking for direct `@sheetwrite/wasm` users:** `CellStore.setBlock` is removed. Use `CellStore.setBlockPacked`, which takes the text of every string cell as one UTF-8 buffer plus byte offsets instead of one JavaScript string per cell. `setColumnBlockPacked` takes the same input in column-major order. Code that uses Sheetwrite through `@sheetwrite/core` or a framework adapter needs no change.
- New engine exports: `setBlockPacked`, `setColumnBlockPacked`, `loadedSpans` (loaded row runs of one column) and `cellSnapshots` with its `CellSnapshot` result (packed old values for detailed change events).
- Core loads columnar data column by column without a row-major copy, reads old values in bulk when detailed change capture is on, and reconciles paged residency with one call per column.

Measured in alternating runs: loading 100,000 to 1,000,000 rows is 26–35% faster, number-only loading is 56–59% faster, a detailed-capture block write is 10% faster, and revisiting an evicted paged band needs 108 residency checks instead of 1,026.
