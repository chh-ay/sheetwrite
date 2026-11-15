---
"@sheetwrite/xlsx": patch
---

XLSX export no longer sends plain formulas (only cell and range references, numbers, quoted text and operators) through the formula engine to write their Excel spelling, since the engine returns them unchanged. This brings back most of the export time lost in 0.7.0 on workbooks with many formulas (#624).
