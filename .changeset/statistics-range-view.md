---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

MEDIAN, MODE.SNGL, LARGE, SMALL, RANK.EQ, PERCENTILE.INC, QUARTILE.INC, STDEV, VAR, GEOMEAN, CORREL and COVARIANCE read the numbers of their range arguments in place, without copying each cell first. Results are unchanged.
