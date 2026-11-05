---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`MATCH`, `XMATCH`, `VLOOKUP`, `HLOOKUP` and `XLOOKUP` search ranges of plain values where they are stored instead of copying them into decoded tables. Formulas that search the same range in one recalculation share one sorted position index, which also covers key columns that mix numbers, text and logical values. The lookup table, list, result, sortedness, type and bucket caches are removed. Results are unchanged.
