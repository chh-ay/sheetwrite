---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`SUM`, `AVERAGE`, `COUNT` and `COUNTA` over a column of numbers read the column in one pass that keeps only what each needs, so they are faster on every machine; on Apple Silicon the previous column fold was slower than reading cell by cell. `MIN` and `MAX` keep their speed. Results do not change.
