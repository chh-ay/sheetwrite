---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

LET bindings that are function calls with a single-value result, such as `SUM`, `ROUND` or `XLOOKUP`, now also read from slots resolved when the formula is entered, instead of being copied into every use on every recalculation. Calls that can return a reference or an array (`INDEX`, `CHOOSE`, `OFFSET`, `INDIRECT`, the array functions) keep the previous path; results do not change.
