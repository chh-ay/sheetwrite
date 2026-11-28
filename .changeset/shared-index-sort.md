---
"@sheetwrite/wasm": patch
---

The engine is smaller: the dependency index and the recalculation bookkeeping sort through the shared sorts instead of a copy of the sort for each list. Results and memory use are unchanged.
