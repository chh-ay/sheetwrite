---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Recalculation does less work per formula: marking a formula selected, being evaluated or settled no longer calls out of line, and the cell whose formula is being evaluated (read by `ROW()`, `COLUMN()` and R1C1 references) is kept in one value instead of a list. No formula result changes.
