---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`FILTER`, `SORT`, `UNIQUE`, `TAKE`, `DROP` and `CHOOSEROWS` now pick rows of the array they read instead of copying it, so a chain of these functions copies its result once, when it spills. Array constants such as `{1,2;3,4}` are no longer copied when a formula reads them. Formulas that chain these functions over large ranges recalculate a few percent faster and allocate less. Results do not change.
