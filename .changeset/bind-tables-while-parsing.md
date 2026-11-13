---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Editing a table is faster in workbooks with many formulas: table references are bound to the table while the formula is parsed, and the table's names are kept once, in the table, instead of in every formula. Adding, resizing, renaming or removing a table updates only the formulas that use it, without parsing every formula again, and appending rows leaves `[@Column]` formulas alone. A formula that names a table that does not exist yet shows `#NAME?` until that table is added, and keeps the text it was written with.
