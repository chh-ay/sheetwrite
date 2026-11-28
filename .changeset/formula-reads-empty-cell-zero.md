---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A formula whose result is an empty cell, such as `=C1` when C1 is empty, an `INDEX` or lookup that finds an empty cell, or a spilled element over one, now holds the number 0, as in Excel. The grid shows 0, `COUNT` counts the cell, `ISBLANK` and `COUNTBLANK` no longer treat it as empty, and filters, sorting, Find, charts and the XLSX export read 0. `=""` still shows nothing, and functions that take the empty cell itself, such as `ISBLANK(C1)` and `SUM(C1)`, still see it as blank. Before, such a formula showed nothing.
