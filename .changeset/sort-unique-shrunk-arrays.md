---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

`SORT` and `UNIQUE` over a `FILTER` or `UNIQUE` that returns fewer rows than its range, such as `=SORT(UNIQUE(A1:A100))` with repeated values or `=SORT(FILTER(…))`, now return the sorted or distinct rows instead of `#REF!`.
