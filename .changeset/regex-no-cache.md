---
"@sheetwrite/formulas": patch
---

`REGEXTEST`, `REGEXEXTRACT` and `REGEXREPLACE` compile their pattern for each call and drop it when the call returns. The engine-wide store of recently compiled patterns is removed, so no compiled pattern stays in memory after the workbook that used it is gone.
