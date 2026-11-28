---
"@sheetwrite/formulas": patch
"@sheetwrite/wasm": patch
---

A conditional-format formula whose references keep their columns fixed, such as `=SUM($A1:$C1)>12` or `=$C1>100`, is evaluated once per row of the visible window instead of once per cell. Such rules are the usual way to highlight whole rows.
