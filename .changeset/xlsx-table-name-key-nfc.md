---
"@sheetwrite/xlsx": patch
"@sheetwrite/core": patch
---

An Excel data model whose connection names a worksheet table in another Unicode form, such as "Ä" typed as one character or as "A" with a combining diaeresis, now finds that table, so its relationships are imported. The XLSX reader compares every table name with core's table-name key (NFC, then letter case ignored), which the internal `@sheetwrite/core/codec` entry point now exports.
