---
"@sheetwrite/formulas": minor
---

Add descriptive statistics, ranking and simple linear regression to the full formula engine: `AVEDEV`, `DEVSQ`, `HARMEAN`, `KURT`, `SKEW`, `SKEW.P`, `TRIMMEAN`, `PERCENTILE.EXC`, `QUARTILE.EXC`, `PERCENTRANK.INC`, `PERCENTRANK.EXC`, `RANK.AVG`, `PEARSON`, `RSQ`, `SLOPE`, `INTERCEPT`, `STEYX`, and `FORECAST.LINEAR` (also spelled `FORECAST`). They use the Excel argument rules: a cell argument is a reference, so text in that cell is ignored, and regression functions skip pairs where either value is not a number. `PERCENTRANK` results are truncated to the requested significant digits, as in Excel. The default `@sheetwrite/wasm` engine does not change.
