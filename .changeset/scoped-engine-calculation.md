---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Use coordinate-keyed hashing for engine cell indexes while retaining randomized hashing for workbook text. Content clears, packed writes, and column writes retain unrelated calculated values and spills and recalculate only their dependent formulas, including cross-sheet and range readers. Large rectangles use bounded range dirty tracking instead of whole-sheet invalidation; style-only clears do not invalidate calculations.

Consolidate engine ownership: CellStorage owns paged storage and local dirty overlays; graph owns formula entries, the dependency index, and recompute dirty state; spill admission accesses cells through storage; window owns conditional-rule caching. Dirty-state memory accounting and internal memory transfers preserve the active cell, rectangle, or whole-sheet representation.

Pack formula source errors, volatility, spill-reference and array-production predicates, and persisted source kind into one byte of per-formula metadata. Parsed formula entries retain the owned source string without copying it; persisted engine-transfer bytes remain unchanged.

Formula edits, clears, column loads and range restores patch the dependency index in place instead of rebuilding it for the whole workbook; only structural edits or a batch that rewrites a large share of the formulas rebuild it.

Circular-reference and nesting-depth checks no longer overflow the stack on long formula chains, and many formulas reading the same large overlapping ranges no longer take quadratic memory.

Release oversized dependency-reader allocations after topology edits. Dense streamed ranges use their existing source slices without a per-column page cache, and paged readers cap their temporary run cache.

Literal-only block writes and history restores on dense sheets write storage column by column instead of cell by cell, and `SUM` reads literal cells without resolving their calculated kind.
