---
"@sheetwrite/formulas": patch
"@sheetwrite/wasm": patch
---

Installing or removing a pivot table's output no longer sorts the output cells before recalculating what reads them. A 100,000-row pivot builds about 2% faster.
