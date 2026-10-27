---
"@sheetwrite/core": minor
---

Add charts to the workbook document. A sheet can hold up to 100 charts in `Sheet.charts`. Each chart is a column, bar, line, area, pie, doughnut or scatter chart. It has up to 32 series, and each series reads cell ranges on any sheet. Use the `setChart` and `removeChart` operations to create, change, move and delete charts. These operations work with undo, sync and snapshots.

Row and column inserts, deletes and moves update chart ranges and anchors. A deleted range becomes `#REF!`. Removing a sheet turns the ranges on it into `#REF!`. Renaming a sheet changes nothing.

`resolveChartView(store, sheet, id)` returns the chart data as plain values: series names, numbers, categories and number formats. It reads at most 10,000 points per range (`MAX_CHART_POINTS`) and marks a longer range as `truncated`. `subscribeChartChanges(store, listener)` calls the listener once per commit with the charts whose data changed. Edits outside every chart range do not call it. Workbooks without charts do not change in speed or memory.

`openChartViews(store)` returns live chart views from the registered chart package and throws when no package is registered. Install `@sheetwrite/charts` and import `@sheetwrite/charts/register`. Other packages can register with `setChartViewProviderFactory`.
