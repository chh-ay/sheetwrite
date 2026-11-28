---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

SUBTOTAL and AGGREGATE inside a LAMBDA skip hidden rows, as in Excel. A range passed to a LAMBDA, such as `=Total(B1:B6)` with `Total` defined as `=LAMBDA(r,SUBTOTAL(9,r))`, is read as that range, so the rows a filter or the user hides are left out.
