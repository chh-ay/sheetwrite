---
"@sheetwrite/formulas": patch
---

`REGEXTEST`, `REGEXEXTRACT` and `REGEXREPLACE` compile a pattern written in the formula once, not in every recalculation. Formulas in one workbook with the same pattern text share the compiled pattern, and it is freed when the last of them is removed. Patterns computed from cells are compiled within each recalculation.
