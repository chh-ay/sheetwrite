---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Distinct-value reads over a column range run several times faster on a column of repeated text: `distinctValues`, AutoComplete's column read, the pivot field list and the AutoFilter dropdown's values and counts. Text that was met before is skipped or counted in one small loop over the column's stored kinds and string ids. The values, their order, counts and formats do not change.
