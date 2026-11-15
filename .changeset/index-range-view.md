---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Read scalar INDEX results directly from their ranges without constructing a full value matrix. On paged sheets, INDEX now waits only for its selected cell and position arguments, not for unrelated unloaded cells in the area. Its text budget applies only to the selected result, so a short result is no longer rejected because unrelated text exceeds the array-copy budget. The whole-area shape limit remains unchanged. Materialized ranges read in column order through the same range view and retain their text-copy budget.
