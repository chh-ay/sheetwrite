---
"@sheetwrite/core": patch
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Changing a filter on a large sheet is faster. The view now hands the engine the rows the filter keeps, which it already has, and the engine lists the rows the filter hides for SUBTOTAL and AGGREGATE itself, instead of JavaScript listing them first.
