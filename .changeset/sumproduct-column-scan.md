---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`SUMPRODUCT` over single columns of typed-in numbers and empty cells multiplies the columns as slices, with one check of each column's cell types and one check of the total, instead of checks on every product. The products and the total add in the same order, so results do not change.
