---
"@sheetwrite/formulas": patch
---

`REGEXTEST`, `REGEXEXTRACT` and `REGEXREPLACE` compile their patterns within one recalculation. The recalculation keeps up to four compiled patterns, each keyed on its exact text and case mode, and shares them with the step that sizes a `REGEXEXTRACT` spill. It drops them when it ends. The engine-wide store of recently compiled patterns is removed, so no compiled pattern stays in memory after a recalculation or after the workbook that used it is gone.
