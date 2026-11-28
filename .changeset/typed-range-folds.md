---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT` and `COUNTA` read range cells from the stored kind and payload arrays instead of building a value per cell. `SUM` over several ranges, or ranges mixed with scalar arguments, folds every argument in order into one running sum, with the same text, logical and error rules. Formulas that sum the same range of plain values in one recalculation share one scan. The range sum cache that lived across recalculations is removed.
