---
"@sheetwrite/core": minor
"@sheetwrite/charts": minor
"@sheetwrite/xlsx": minor
---

Charts draw multi-level category labels, as Excel does (#501).

- A category range of several rows and several columns holds one category level per column (per row when the values run along a row). The last column labels each point. `ChartSeriesView.categoryLevels` holds the outer levels, outermost first, each with `labels` and `formats`; a blank cell continues the group above it. `categories` stays the innermost level, so charts with one level do not change.
- A chart over a pivot with more than one row field gets its outer row fields as outer levels. `categories` holds the leaf items, not the joined `East / Retail` label.
- The renderer draws one row of labels per level: each outer label once, centered under its group, with lines between categories and groups. Crowded inner labels turn to read upward, and outer labels wrap. In bar charts the outer labels stand left of the inner labels and read upward.
- `ChartDefinition.axes.multiLevelLabels: false` draws one row of labels, each the text of its levels from the outside in (Excel's Format Axis › Multi-level Category Labels, cleared). The Chart panel has a **Multi-level category labels** check box when the categories have levels.
- XLSX writes category levels as `c:multiLvlStrRef` and reads them back; `c:noMultiLvlLbl` round trips. A chart over a pivot now reads the cells that hold the pivot's values, with the values as its cache: over a native worksheet PivotTable it is that table's PivotChart (`c:pivotSource`), and over a dashboard pivot item it reads the item's cells. Without such cells it keeps literal data; category levels then have the formula `#REF!` and the labels in their cache.
