---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

A recalculation reports each changed pivot table cell once to chart tracking. Before, every changed output cell was reported twice, so a commit that changed a large pivot did twice the chart matching work and reached the report's limit sooner, which made every chart refresh.
