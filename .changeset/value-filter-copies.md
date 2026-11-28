---
"@sheetwrite/core": patch
---

Filtering a column by a long list of picked values is faster. The picked values are copied one by one instead of through JSON text, and the transaction measures the copy in one pass. On 100,000 rows, a filter that picks 50,000 values takes about 70% less time.
