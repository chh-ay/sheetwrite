---
"@sheetwrite/core": patch
---

Resolving a chart and tracking which charts a commit changes cost less. `resolveChartView` looks sheets up in the store's sheet index instead of building a map of every sheet for each chart, and `ChartView.chart` is now the store's own definition instead of a deep copy. The store replaces a chart definition when it changes and never writes into one, so do not modify it either. The change tracker marks each chart once per commit in one array instead of building per-sheet sets.
