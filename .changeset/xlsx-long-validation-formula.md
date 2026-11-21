---
"@sheetwrite/xlsx": patch
"@sheetwrite/core": patch
---

An XLSX file with a data validation formula longer than 255 characters now opens. Excel keeps these formulas within 255 characters, but other tools write longer ones. The reader drops such a rule with a `validation-loss` warning, as it drops a conditional format whose formula is too long. Before, the whole import failed with "imported invalid workbook snapshot". `@sheetwrite/core` exports the limit as `MAX_VALIDATION_FORMULA_LENGTH`.
