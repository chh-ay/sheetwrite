---
"@sheetwrite/core": minor
---

Show charts over the cells. Each chart floats at its anchor and follows scroll, zoom, row and column sizes, hidden rows and columns, and frozen panes. Click a chart to select it; drag it or its handles to move or resize it; use the arrow keys to move it by a pixel (Shift: by a cell), Delete to remove it, Enter to open its panel and Escape to return to the grid. Each change is one undo step. New `Grid` methods: `getCharts(sheet?)`, `setChart(chart, sheet?)` and `removeChart(id, sheet?)` return the transaction result, and `selectChart(id, sheet?)` selects a chart; new events `chart-select` and `chart-activate`. Hosts that draw charts themselves register a `ChartRenderer` with `setChartRendererFactory`. Without a renderer, a chart shows as a frame with its title. Series colors come from `--sheetwrite-chart-1` to `--sheetwrite-chart-8`.
