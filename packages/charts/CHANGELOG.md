# @sheetwrite/charts

## 0.6.1

### Patch Changes

- Updated dependencies [[`c29a25a`](https://github.com/chh-ay/sheetwrite/commit/c29a25a65c4ff01ae32ad89fc6b32dde4798ffde)]:
  - @sheetwrite/core@0.6.1

## 0.6.0

### Minor Changes

- b159a35: Draw charts as SVG: column, bar, line, area, pie, doughnut and scatter, with axes in the source cells' number formats, titles and a legend. Empty and non-numeric cells are gaps; a truncated or deleted source shows a note. Dense line, area and scatter series keep the lowest and highest value in each pixel, so 10,000 points draw fast. Each chart is an image named by its title and kind, and it redraws only when its own data changes. `registerChartsBackend()` now registers the renderer as well as the live views.
- d99f762: Add the optional `@sheetwrite/charts` package. `createChartViewCache(store)` gives a chart renderer the resolved data for the charts in a workbook. `get({ sheet, id })` returns the `ChartView` for a chart, or `null` when the sheet has no chart with that ID. The cache reads the cells on the first `get` only, and keeps the view until an edit changes that chart. `subscribe(listener)` tells you which charts changed. The cache removes the old views before it calls the listeners, so `get` in a listener returns the new data. Edits to other cells do not call the listener. `dispose()` stops the cache. Core does not depend on this package, and the package does not draw charts.
  
  Import `@sheetwrite/charts/register`, or call `registerChartsBackend()`, to make core's `openChartViews(store)` return these chart views. The root entry does not register anything.

### Patch Changes

- Updated dependencies [cbcf0b8]
- Updated dependencies [81e45e3]
- Updated dependencies [92dcd37]
- Updated dependencies [d99f762]
- Updated dependencies [b159a35]
- Updated dependencies [b159a35]
- Updated dependencies [b159a35]
- Updated dependencies [92dcd37]
- Updated dependencies [92dcd37]
- Updated dependencies [b6f333c]
- Updated dependencies [8d70aae]
- Updated dependencies [9dc3ab1]
- Updated dependencies [03ad409]
- Updated dependencies [286ac93]
- Updated dependencies [ec8e0ee]
- Updated dependencies [0b5cc2d]
- Updated dependencies [ec8e0ee]
- Updated dependencies [78665d3]
- Updated dependencies [60590f9]
- Updated dependencies [c56a350]
- Updated dependencies [c0f9c00]
- Updated dependencies [0f36fda]
- Updated dependencies [92dcd37]
- Updated dependencies [c56a350]
- Updated dependencies [3bdb073]
- Updated dependencies [ec8e0ee]
- Updated dependencies [bcfe991]
- Updated dependencies [bcfe991]
- Updated dependencies [2984b0b]
- Updated dependencies [5308206]
  - @sheetwrite/core@0.6.0
