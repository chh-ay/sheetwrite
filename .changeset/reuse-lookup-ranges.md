---
"@sheetwrite/wasm": patch
---

Reuse a decoded lookup range for every lookup against it in one recalculation.
`VLOOKUP`, `HLOOKUP`, `XLOOKUP`, `MATCH` and `XMATCH` used to read their whole
range per formula; they now read it once per recalculation and share the sorted
flags, the exact-match index and the search across later lookups. Text keys
compare without building lowercase copies on every candidate, and reductions
(`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA` over any number of ranges,
plus `SUMIF(S)`, `COUNTIF(S)` and `AVERAGEIF(S)`) walk their ranges instead of
materializing every cell first.
