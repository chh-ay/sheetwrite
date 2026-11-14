---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Defining, changing or removing a defined name is faster in workbooks with many formulas: only the formulas that use the name, directly or through another name, are read again, instead of every formula of the workbook. The same holds when a row or column edit, a moved block, a removed sheet or a table edit changes a name.
