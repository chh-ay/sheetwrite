---
"@sheetwrite/core": patch
---

A new store starts faster again: with default limits it no longer copies them, its resource counters are made when first used, it checks the workbook's tables once, and it makes no engine call to set default storage limits or an empty data model. On the paged startup benchmark (1,000,000 rows) the store is now built faster than in 0.6.1.
