---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT` and `COUNTA` over a single column of typed-in numbers and empty cells read the column as one slice, with one check for the whole column, instead of cell by cell. The sum still adds in row order, so results do not change.
