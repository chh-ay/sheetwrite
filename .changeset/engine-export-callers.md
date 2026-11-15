---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
---

Remove superseded column writers and unused history methods. CI now rejects an engine binding with no package, test or benchmark caller unless its Rust docs give an intentional public-API reason. The scalar setters and `clearCell`, sheet dimensions and window dimensions stay public. Query resource counters stay public because benchmark probes check cache construction and owned-string counts.

Removed: `CellStore.setColumnNumbers`, `CellStore.setColumnStrings` and `CellStore.setColumnStringsPacked`; use `setColumnBlockPacked`, `setBlockPacked` or `setSparseBlock` instead.

Removed: `DiffKernel.clearPage`; consume the page arrays, then call `compare` to start the next page instead. Removed: `DiffKernel.pageLength`; use the length of a returned page array instead.
