---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

ROUND, ROUNDUP, ROUNDDOWN, FLOOR and CEILING are faster. They keep Excel's decimal results, such as `ROUND(1.005,2)` giving 1.01, but no longer turn each number into text and back. Recalculating 10,000 `ROUND` formulas takes about 40% less time.
