---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Column aggregates (`SheetwriteStore.aggregate`, the engine's `aggregate`, used by grid aggregates and status totals) now give the same result on dense sheets as on paged sheets, as Excel does. On a dense sheet, a formula that returns TRUE or FALSE counted as 1 or 0, and a formula that returns a blank counted as 0; both are now ignored. Values that a formula spills into other cells were skipped; they now count.
