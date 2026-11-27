---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

INDIRECT with a plain cell address such as `"A12"` finds the cell without parsing the text as a formula, so INDIRECT formulas recalculate about 20% faster.
