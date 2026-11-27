---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

LARGE, SMALL and RANK.EQ formulas that read the same range recalculate much faster. When more than one of them reads a range of plain values, the range is sorted once per recalculation and each formula finds its answer in the sorted list instead of reading every cell. 2,000 RANK.EQ and 2,000 LARGE formulas over one 4,000-row column recalculate about 25 times faster.
