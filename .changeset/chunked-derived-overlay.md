---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Allocate dense calculated values in lazy 512-cell chunks instead of reserving an entire sheet on its first formula. Empty chunks are released when spills shrink, and memory-release transfers retain only populated chunks.

Track live chunks so empty-overlay reads and source writes keep their fast paths. Resolve scalar spill kinds and payloads together to avoid repeated chunk lookups. Avoid wide range-cache allocations for single-row scans, and check paged-cell load state before reading its payload.
