---
"@sheetwrite/core": patch
---

A new store starts faster. It no longer sends a sheet's spill blockers or hidden rows to the engine when the sheet has none, builds the data validation reads on the first edit that needs them, and resolves its snapshot limits once. On the paged startup benchmark (1,000,000 rows) the store is built about 17% faster than in 0.7.0.
