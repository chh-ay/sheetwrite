---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`COUNTIF(S)`, `SUMIF(S)`, `AVERAGEIF(S)`, `MAXIFS` and `MINIFS` over single columns of typed-in values test each criterion down its whole column into a row mask, then read only the matched rows. Checking that a range holds only typed-in values, which these functions and `SUMPRODUCT`, `PERCENTILE.INC`, `CORREL` and `COVARIANCE` do first, reads the column in one pass without a branch per cell. No formula result changes.
