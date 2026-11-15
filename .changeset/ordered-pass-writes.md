---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A recalculation in which no formula reads another formula writes each result straight to its cell, without a pass result table or a second write loop. Results are unchanged.
