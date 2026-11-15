---
"@sheetwrite/formulas": patch
---

Measures evaluate each `CALCULATE` once per distinct filter context in a pivot update, so cells that see the same rows share one evaluation, such as every region of a quarter under `ALL` of the region (#230).
