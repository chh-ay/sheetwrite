---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Workbooks whose formulas repeat a reference to another sheet, such as `=Data!A1+Data!B1` filled down a column, load faster: those formulas now reuse the parsed form of the formula before them, as formulas without a sheet name already did. A reused form is checked against the sheets the workbook has, so a renamed or added sheet still binds correctly.
