---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Functions take up to 255 arguments, as in Excel: `SUM`, `AVERAGE`, `NPV`, `SUBTOTAL`, `IMSUM` and the others no longer show `#VALUE!` at 255. A call with 256 or more arguments is a syntax error ("A function takes at most 255 arguments."), as Excel refuses such a formula; before, `VSTACK` and other functions accepted it.
