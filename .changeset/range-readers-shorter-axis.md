---
"@sheetwrite/core": patch
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

An edit finds the formulas that read a cell through a range much faster when many ranges share the cell's columns or rows, as a SUM across each row does. The engine's range index now scans the axis that ends first instead of always the columns. On a sheet with a SUM in each of 10,000 rows, one transaction of 300 one-cell edits took 406 ms in the engine before and 3.4 ms after. Results and recalculation order do not change.
