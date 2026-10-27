---
"@sheetwrite/charts": minor
---

Add the optional `@sheetwrite/charts` package. `createChartViewCache(store)` gives a chart renderer the resolved data for the charts in a workbook. `get({ sheet, id })` returns the `ChartView` for a chart, or `null` when the sheet has no chart with that ID. The cache reads the cells on the first `get` only, and keeps the view until an edit changes that chart. `subscribe(listener)` tells you which charts changed. The cache removes the old views before it calls the listeners, so `get` in a listener returns the new data. Edits to other cells do not call the listener. `dispose()` stops the cache. Core does not depend on this package, and the package does not draw charts.
