---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`IF` without a `value_if_false` argument now returns `FALSE` when the condition is false, as in Excel: `=IF(1>2,"yes")` shows `FALSE`, not `0`. An empty branch, as in `=IF(TRUE,)` or `=IF(FALSE,1,)`, now shows `0` instead of an empty cell.
