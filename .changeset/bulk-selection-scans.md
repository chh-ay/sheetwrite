---
"@sheetwrite/core": patch
---

Read selection styles and detailed clear events in batches, and avoid repeated paged dirty-state reads for large sparse edits. In local alternating comparisons, a 4,096-cell toolbar summary took 52% less time, detailed clears of 10,000–100,000 cells took 69% less time, and acknowledging a 10,000-cell sparse edit without a stored revision took 25% less time.
