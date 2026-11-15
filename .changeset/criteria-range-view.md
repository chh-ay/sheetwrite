---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Criteria functions and `SUMPRODUCT` share the range view's borrowed literal columns. Criteria folds use one row-major reader for formula and paged cells, preserving error and loading order without materializing whole ranges.
