---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A dynamic array that grows or shrinks, such as a `FILTER` whose condition changes for one row, now wakes only the formulas that read a cell whose value changed. Before, every formula that read any spilled cell recalculated. A 100,000-row `FILTER` that gains or loses one row recalculates about twice as fast. Results do not change.
