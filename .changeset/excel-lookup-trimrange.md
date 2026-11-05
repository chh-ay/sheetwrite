---
"@sheetwrite/wasm": minor
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
---

Both engines add `LOOKUP` and `TRIMRANGE` (#280). `LOOKUP` has the vector form and the array form, which searches the first row of an array wider than it is tall and the first column otherwise. `TRIMRANGE` removes leading and trailing blank rows and columns; a range with no value is `#REF!`, as in Excel.

`GETPIVOTDATA` is not added yet: formulas cannot read pivot results until the pivot API can answer a field and item query.
