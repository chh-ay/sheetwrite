---
"@sheetwrite/xlsx": patch
---

XLSX export writes a `text` column in Excel's Text format `@`, and import reads a column in `@` as a `text` column. Before, a `text` column came back from a round trip as `general`, so a typed `007` became the number 7.
