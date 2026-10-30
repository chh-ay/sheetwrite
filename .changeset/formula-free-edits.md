---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Value edits in a workbook without formulas or pivot tables no longer run the formula recalculation pass. The pass is the largest function of the engine, and the WebAssembly runtime compiled it while the first edits ran, so the first thousands of edits of a data grid were slower than in 0.5.4. Calculated values and edit results do not change.
