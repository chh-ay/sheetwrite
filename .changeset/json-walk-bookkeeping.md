---
"@sheetwrite/core": patch
---

Small transactions are faster. Before a transaction applies, Sheetwrite measures its JSON size and refuses values that JSON cannot carry. That check no longer records the path to each value and the objects above it, which only an error message needs; when it finds a problem, it checks again with them to report it. On 1,000 rows, 1,000 single-cell edits take about 15% less time and a column filter about 5% less.
