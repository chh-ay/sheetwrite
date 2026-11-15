---
"@sheetwrite/core": patch
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---
Chart tracking no longer refreshes every formula-backed chart after unrelated value edits. While a chart tracker is attached, both engines report bounded rectangles of recomputed formulas and changed spill and pivot cells, and core names only charts whose sources intersect them. Overflow and custom stores keep the conservative refresh.
