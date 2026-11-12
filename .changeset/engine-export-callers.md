---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Remove superseded column writers and unused diagnostics. CI now rejects an engine binding with no package or test caller unless its Rust docs give an intentional public-API reason. The scalar setters and `clearCell`, sheet dimensions and window dimensions stay public.

Removed: `CellStore.setColumnNumbers`, `CellStore.setColumnStrings` and `CellStore.setColumnStringsPacked`; use `setColumnBlockPacked`, `setBlockPacked` or `setSparseBlock` instead.

Removed: `CellStore.queryResourceStats` and `CellStore.resetQueryResourceStats`; use application-side benchmark measurements instead of the internal query counters.

Removed: `DiffKernel.clearPage`; consume the page arrays, then call `compare` to start the next page instead. Removed: `DiffKernel.pageLength`; use the length of a returned page array instead.
