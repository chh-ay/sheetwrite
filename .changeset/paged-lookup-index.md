---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Lookups and single-column folds read a paged sheet's loaded cells in place, as they do on a dense sheet. `VLOOKUP`, `HLOOKUP`, `XLOOKUP`, `MATCH`, `XMATCH` and `INDEX` over a fully loaded range of literal values use the shared search index and binary search instead of evaluating the range cell by cell (1,000 exact `VLOOKUP`s over a paged table went from about 377 ms to 0.7 ms), and `SUM`, `COUNT`, `COUNTA`, `AVERAGE`, `MIN` and `MAX` over one paged column fold its clean pages a slice at a time. Results are unchanged.
