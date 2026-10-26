---
"@sheetwrite/xlsx": patch
---

XLSX import now parses each worksheet from bounded inflated chunks instead of building a whole-worksheet XML tree. On a generated 200,000 × 8 workbook, median import peak RSS fell from 1,556 MiB to 994 MiB (buffered) and 1,068 MiB (`fromXlsxWorkbookFile`); single runs varied by up to about 400 MiB.
