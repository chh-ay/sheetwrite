---
"@sheetwrite/core": minor
"@sheetwrite/wasm": minor
---

Dashboards show PivotCharts (#231). `ChartDefinition.pivot` names a pivot on the same sheet; the chart shows its row items as categories and each value field, for each column item, as a series, without subtotals or totals, as an Excel PivotChart does. The new `DashboardChartItem` (`kind: "chart"`) shows such a chart in a dashboard box, and **Insert › Charts › PivotChart** adds both in one undo step. Slicers filter the chart with its pivot.
