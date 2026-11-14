---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
"@sheetwrite/core": patch
---

`setSheetName` returns whether it named the sheet. Like `renameSheet`, it refuses an empty name, a name another sheet holds in any case, and another sheet's id.
