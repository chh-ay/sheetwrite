---
"@sheetwrite/formulas": patch
---

`REGEXTEST`, `REGEXEXTRACT` and `REGEXREPLACE` compile their pattern within one recalculation: formulas evaluated in a row with the same pattern and case mode share one compiled program, and the recalculation drops it when it ends. The engine-wide store of recently compiled patterns is removed, so no compiled pattern stays in memory after a recalculation or after the workbook that used it is gone.
