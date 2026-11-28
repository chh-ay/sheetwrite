---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A formula whose result is blank, such as `=C1` when C1 is empty, now reads as an empty cell in Find, the "contains" filter and the column text filter, as it already did in the value, Empty and Non-empty filters, sorting and totals. Before, searching for "0" found it, although the cell shows nothing.
