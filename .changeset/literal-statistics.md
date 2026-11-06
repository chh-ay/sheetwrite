---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`PERCENTILE.INC` with a number as its fraction (`=PERCENTILE.INC(A1:A100000,0.9)`), `CORREL`, `COVARIANCE.S` and `COVARIANCE.P` read ranges of typed-in values in place instead of copying them into lists first. Ranges with formulas, spilled values or paged storage, and computed fractions, use the existing path. No formula result changes.
