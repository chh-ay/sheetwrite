---
"@sheetwrite/xlsx": patch
---

An XLSX file with a broken style part (a style attribute that is not a whole number, a custom number format without an id or code, a style that names a missing font, fill or border, or a cell that names a missing style) is now refused with the same "invalid XLSX workbook" error as every other malformed part, instead of an error worded differently.
