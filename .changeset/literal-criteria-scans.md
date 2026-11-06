---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`COUNTIF`, `COUNTIFS`, `SUMIF`, `SUMIFS`, `AVERAGEIF`, `AVERAGEIFS`, `MAXIFS` and `MINIFS` are now 4–8 times faster over ranges of typed-in values, such as `=SUMIFS(D1:D100000,A1:A100000,">=50000",C1:C100000,"keep")`. They read each cell's stored number, text or logical value in place instead of building a value, and a text copy, for every cell. Ranges with formulas, spilled values or paged storage use the cell reader as before. No formula result changes.
