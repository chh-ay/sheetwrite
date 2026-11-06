---
"@sheetwrite/core": minor
"@sheetwrite/xlsx": patch
"@sheetwrite/formulas": patch
---

A chart over a worksheet pivot (`ChartDefinition.pivot`) plots the pivot's leaf items, as an Excel PivotChart does. Before, it showed only on dashboards. The categories are the leaf row items, with the outer items joined into each label (`East / Retail`), and each value field, for each column item, is one series. Subtotals and grand totals are never points, in compact and tabular layout. The chart follows the pivot's fields, filters and source edits, `pivotValues` picks the values it plots, and it keeps no values of its own.

- The full engine computes a copy of the pivot for its charts, without totals and without cells: core anchors the copy below the last row, and a pivot anchored outside its sheet places no output.
- The code that reads charts over pivots loads with the first such chart. A change event names the charts when it has loaded; that event has no `epoch`.
- With the active cell in a worksheet pivot, Insert › Charts › PivotChart adds a chart over that pivot to the right of its output.
- XLSX export writes the chart with the values it plots, and import reads it back as a chart over the pivot.
