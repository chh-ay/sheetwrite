---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Dense column readers now skip the general paged-cell path where it is not needed. Style scans skip equal adjacent ids. Ordered data-edge scans classify literal kinds without resolving each cell. Text filters and numeric sort-key scans use dense slices. Paged sheets keep their load checks and eviction order. Values, style ids, sorting and navigation results do not change.
