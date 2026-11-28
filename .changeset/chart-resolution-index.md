---
"@sheetwrite/core": patch
"@sheetwrite/charts": patch
---

Resolving a chart and tracking which charts a commit changes cost less. `resolveChartView` looks sheets up in the store's sheet index instead of building a map of every sheet for each chart, and `ChartView.chart` is now the store's own definition instead of a deep copy, typed with the new `ReadonlyChartDefinition` (read-only all the way down), so TypeScript rejects a write into it. Development builds (`NODE_ENV=development`) freeze it, so a write from JavaScript throws. To edit a chart, copy the definition (for example with `structuredClone`) and commit it with `setChart`. Code that passed `view.chart` where a mutable `ChartDefinition` is expected needs that copy. The change tracker marks each chart once per commit in one array instead of building per-sheet sets.
