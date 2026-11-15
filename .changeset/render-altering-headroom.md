---
"@sheetwrite/bench": patch
---

The render benchmark's altering rows make room below the row and dense-cell limits before they time an insert, so they measure it at 1,000,000 rows too, and the Sheetwrite adapter fails a row edit the store refuses instead of timing a no-op.
