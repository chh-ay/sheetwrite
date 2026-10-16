---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Allocate dense calculated values in lazy 512-cell chunks instead of reserving an entire sheet on its first formula. Empty chunks are released when spills shrink, and memory-release transfers retain only populated chunks.
