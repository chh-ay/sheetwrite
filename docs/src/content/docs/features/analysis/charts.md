---
title: Charts
description: "Add column, bar, line, area, pie, doughnut and scatter charts that read cell ranges and redraw when those cells change; place, move and edit them in the grid."
---

```ts prelude="core" partial="requires a grid with month names in A2:A4 and revenue in B2:B4" title="A line chart of three months"
import { chartsAddon } from "@sheetwrite/charts";
import { initSheetwrite } from "@sheetwrite/core";

await initSheetwrite({ addons: [chartsAddon()] });
grid.setChart({
  id: "revenue",
  kind: "line",
  title: "Revenue",
  anchor: { row: 0, col: 3, offsetX: 0, offsetY: 0, width: 480, height: 288 },
  series: [{
    nameRange: { sheet: "s", start: { row: 0, col: 1 }, end: { row: 0, col: 1 } },
    values: { sheet: "s", start: { row: 1, col: 1 }, end: { row: 3, col: 1 } },
    categories: { sheet: "s", start: { row: 1, col: 0 }, end: { row: 3, col: 0 } },
  }],
});
```

<div class="sw-grid-result" data-caption="The cells the chart reads: edit B3 and the line redraws">

| Month | Revenue |
| --- | --- |
| Jan | 120 |
| Feb | 95 |
| Mar | 140 |

</div>

[Try it live: a chart over a pivot of two years of orders](/showcases/analysis/).

<details>
<summary>Full setup</summary>

```ts compile runnable title="A grid with three months of revenue and a line chart"
import { chartsAddon } from "@sheetwrite/charts";
import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (!host) throw new Error("Missing #grid host");
host.style.height = "360px";

// Without the charts add-on a chart shows as a frame with its title.
await initSheetwrite({ addons: [chartsAddon()] });

const workbook: Workbook = {
  activeSheet: "s",
  sheets: [{ id: "s", name: "Sales", rowCount: 4, columns: [
    { key: "month", header: "Month", width: 96, type: "text" },
    { key: "revenue", header: "Revenue", width: 96, type: "number" },
    // The chart floats over columns D to H, so the sheet must have them.
    ...["c", "d", "e", "f", "g", "h"].map((key) => ({ key, header: "", width: 96, type: "text" as const })),
  ] }],
};
const grid = createGrid(host, {
  workbook,
  data: { rowCount: 4, columns: {
    month: ["Month", "Jan", "Feb", "Mar"],
    revenue: ["Revenue", 120, 95, 140],
  } },
});

const result = grid.setChart({
  id: "revenue",
  kind: "line",
  title: "Revenue",
  anchor: { row: 0, col: 3, offsetX: 0, offsetY: 0, width: 480, height: 288 },
  series: [{
    nameRange: { sheet: "s", start: { row: 0, col: 1 }, end: { row: 0, col: 1 } },
    values: { sheet: "s", start: { row: 1, col: 1 }, end: { row: 3, col: 1 } },
    categories: { sheet: "s", start: { row: 1, col: 0 }, end: { row: 3, col: 0 } },
  }],
});
if (result.status !== "applied") throw new Error("The chart was not added");
```

</details>

A chart reads cell ranges. It does not copy their values: when a source cell
changes, by an edit, a formula, a spill or a pivot, the chart redraws. A chart
belongs to a sheet and floats over its cells.

## Add the charts package

Core keeps the chart definitions, and `@sheetwrite/charts` draws them. Install
it and pass `chartsAddon()` to `initSheetwrite({ addons })` before you create
grids. Grids created before that draw each chart as a frame with its title.

```sh verify title="Install the charts package"
npm install @sheetwrite/charts
```

Without the package, the document still keeps, saves, undoes and synchronizes
charts, and each one shows as a plain frame with its title. Grids that have no
charts do not load chart code.

## Define a chart

Commit the complete definition with `setChart(chart, sheet?)`. A second call
with the same `id` on the same sheet replaces the chart. Each call is one undo
step and returns the transaction result, so a rejected chart reports why.

| Field | Meaning |
| --- | --- |
| `id` | A stable ID, unique on its sheet. |
| `kind` | `column`, `bar`, `line`, `area`, `pie`, `doughnut` or `scatter`. |
| `title` | Text above the chart. Without it, the chart has no title. |
| `axes` | `{ xTitle, yTitle, multiLevelLabels }`: the axis titles, and `false` to draw category levels in one row. |
| `legend` | `none`, `top`, `right`, `bottom` or `left`. |
| `anchor` | The top-left cell (`row`, `col`), the offset from that cell, and the size, all in CSS pixels. |
| `series` | One entry for each series: `values`, optional `categories`, and a `name` or a `nameRange`. |
| `pivot` | The ID of a pivot on the same sheet. The chart then shows that pivot, as an Excel PivotChart does, and `series` is empty. See [Charts over pivots](#charts-over-pivots). |
| `pivotValues` | With `pivot`, the value fields to plot, by position in the pivot's `values`. Without it, the chart plots every value field. |

Ranges can be on any sheet. Pie and doughnut charts draw the first series.
Scatter charts use numeric categories as x values.

- `getCharts(sheet?)` returns copies of the definitions.
- `removeChart(id, sheet?)` removes a chart as one undo step.
- `selectChart(id, sheet?)` selects a chart, and `null` clears the selection.

Limits: 100 charts on a sheet, 32 series in a chart, and 10,000 points in a
source range. A longer range draws its first 10,000 cells and shows a note.

## What the chart shows

- Text, booleans, errors and empty cells are gaps, not zeros.
- Axis labels use the number format of the source cells.
- A deleted source range becomes `#REF!`, and the chart shows a note.
- Dense line, area and scatter series are thinned to the lowest and highest
  value in each horizontal pixel, so a 10,000-point series stays fast.
- Screen readers announce a chart by its title and kind. The chart image inside
  it has a description that lists the series.

### Multi-level category labels

A category range of several columns holds one category level per column, as
in Excel ([Change the display of chart axes](https://support.microsoft.com/en-us/office/change-the-display-of-chart-axes-422c97af-1483-4bad-a3db-3a9ef630b5a9),
"Multi-level Category Labels"). The last column labels each point, and each
column to its left is an outer level. When the values run along a row, the
category range has one level per row, and the last row is the inner level.

| Region | Segment | Amount |
| --- | --- | --- |
| East | Retail | 10 |
| | Online | 7 |
| West | Retail | 4 |
| | Online | 11 |

With categories A2:B5 and values C2:C5, the chart draws Retail, Online,
Retail, Online on the first row of labels, and East and West once each on the
second row, centered under their groups. A blank cell continues the group
above it; a filled cell starts a new group, also when it repeats the label
above. Lines divide the categories through the first row and the groups
through every row.

- Inner labels that do not fit their band turn to read upward. When they
  still overlap, only every n-th inner label is drawn. Outer labels wrap
  within their group.
- In a bar chart, the levels stand in columns left of the plot, and outer
  labels read upward, as in Excel.
- `axes.multiLevelLabels: false` draws one row of labels, as Excel does when
  Format Axis › Multi-level Category Labels is cleared: each label is the text
  of its levels from the outside in, such as `East Retail`. The Chart panel
  shows the **Multi-level category labels** check box when the categories
  have levels.
- Pie and doughnut charts name each slice from the outside in.
- Scatter charts read the categories as x values, so they have no levels.

## Insert and edit in the grid

Grids with the ribbon have **Insert › Chart**. Its face makes a column chart
from the selection, and its menu makes any of the seven kinds. A text first row
gives the series names, and a text first column gives the categories. The chart
panel opens beside the grid, where you change the kind, the ranges and the
titles. Each change is one undo step.

Right-click a chart, or press Shift+F10 on a selected chart, for **Edit chart**
and **Delete chart**.

Click a chart to select it. Drag it to move it, or drag a handle to resize it.
On a read-only grid you can select a chart, but not change it.

| Key | Action on the selected chart |
| --- | --- |
| Arrow keys | Move by one pixel |
| Shift+arrow keys | Move by one cell |
| Enter | Open the chart panel |
| Delete or Backspace | Remove the chart |
| Escape | Return to the grid |

The grid emits `chart-select` with `{ sheet, id }`, or `null`, when the
selection changes, and `chart-activate` when Enter is pressed on a chart.

## Charts over pivots

A chart with `pivot` shows the result of that pivot, as an Excel PivotChart
does ([Create a PivotChart](https://support.microsoft.com/en-us/office/create-a-pivotchart-c1b1e057-6990-4c38-b52b-8255538e7b1c)):

- The categories are the leaf row items. When the pivot has more than one row
  field, the outer row fields are the outer category levels, as in an Excel
  PivotChart: each outer item shows once, under its group. See
  [Multi-level category labels](#multi-level-category-labels).
- Each value field, for each column item, is one series.
- Subtotals and grand totals are never points, whatever the pivot's layout
  and total settings. Excel PivotCharts do not plot them either
  ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/4838157/how-to-show-grand-totals-on-pivot-chart)).
- The chart follows the pivot's fields, filters and sort, and each edit of its
  source. Changes to an Excel PivotTable show in its PivotChart the same way
  ([Overview of PivotTables and PivotCharts](https://support.microsoft.com/en-us/office/overview-of-pivottables-and-pivotcharts-527c8fa3-02c0-445a-a2db-7794676bce96)).
- A measure point is the pivot's measure cell for the same items.

The chart keeps no values of its own. Charts over pivots need the full engine,
which computes the pivot, and the code that reads them loads the first time
such a chart is drawn. With the default engine, the chart has no series.

On a worksheet, select a cell of a pivot to show **Insert › Charts ›
PivotChart**. It adds a chart of the chosen kind over that pivot, to the right
of its output, and opens the chart panel. On a dashboard, see
[PivotCharts](/docs/features/analysis/dashboards/#pivotcharts).

## Charts in XLSX files

With `@sheetwrite/xlsx`, `fromXlsxWorkbook` reads Excel charts into
`Sheet.charts`, and `toXlsxWorkbook` writes `Sheet.charts` as Excel chart
parts. Excel and LibreOffice open these files with the charts shown.

| Sheetwrite | Excel chart |
| --- | --- |
| `column`, `bar` | Clustered column or bar chart |
| `line`, `area` | Standard line or area chart |
| `pie`, `doughnut` | Pie or doughnut chart |
| `scatter` | Scatter chart |
| `title`, `axes`, `legend` | Chart title, axis titles, legend position |
| `series` | Series name, categories (x values in a scatter chart) and values, each one cell range or a name |
| `anchor` | The top-left cell, its offset and the chart size |

Imported charts read the same cells as the Excel chart, so a cell edit updates
them. Import keeps an Excel chart that this table cannot hold as an opaque part
and emits an `unsupported-feature` warning. Examples are 3-D, stacked and
combination charts, Excel PivotCharts, and series that read literal values or
several ranges. See
[Kept parts and round trips](/docs/import-export/kept-parts-and-round-trips/).

Export writes a chart over a pivot with references to the cells that hold the
pivot's values, and those values as the chart's cache:

- Over a worksheet pivot that the export writes as an Excel PivotTable, the
  chart is that table's PivotChart (`c:pivotSource`). Its ranges span the
  table's rows, as Excel's PivotCharts do, also in compact layout and with
  subtotals.
- Over a pivot whose values the export writes as cells, for example a pivot
  item on a dashboard or a pivot kept in Sheetwrite metadata, the chart reads
  those cells when the points fill them in order, as a tabular pivot without
  subtotals writes them.
- Otherwise the chart holds literal data. Category levels then have the
  formula `#REF!` and the labels in their cache, because OOXML has no literal
  form with levels.

Category levels are `c:multiLvlStrRef` in both directions. Sheetwrite keeps
the chart's `pivot` in its metadata, so the file opens in Sheetwrite as a
chart over the pivot again.

Import reads each chart part once per drawing. Repeated frames for that part
stay opaque and emit the same warning. Once a sheet reaches its chart limit,
further chart frames also stay opaque instead of being parsed into charts.

Excel files do not store colors, fonts or styles from Sheetwrite. A chart that
Sheetwrite exports has Excel's default style.

## Styles

Charts need `@sheetwrite/core/styles/charts.css`, which also sets the series colors. The Chart panel needs `@sheetwrite/core/styles/panels.css` and `@sheetwrite/core/styles/icons.css`. `@sheetwrite/core/styles.css` includes every part; see [Stylesheet parts](/docs/features/formatting/styles/#stylesheet-parts).

## Colors

Series take their colors in order from `--sheetwrite-chart-1` to
`--sheetwrite-chart-8`. The defaults have enough contrast on light and dark
themes. Set the variables on the grid's host element to use your palette.

## Live data without a grid

A host that draws its own charts can read the same live data.
`createChartViewCache(store)` from `@sheetwrite/charts` returns resolved views:
the values, categories and number formats of each series. It notifies its
listeners when a chart's data changes, and gives no notice for edits to other
cells.
