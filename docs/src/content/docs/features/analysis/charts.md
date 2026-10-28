---
title: Charts
description: "Add column, bar, line, area, pie, doughnut and scatter charts that read cell ranges and redraw when those cells change; place, move and edit them in the grid."
---

```ts prelude="core" partial="requires a grid with month names in A2:A4 and revenue in B2:B4" title="A line chart of three months"
import { registerChartsBackend } from "@sheetwrite/charts";

registerChartsBackend();
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

```ts compile title="A grid with three months of revenue and a line chart"
import { registerChartsBackend } from "@sheetwrite/charts";
import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (!host) throw new Error("Missing #grid host");
host.style.height = "360px";

await initSheetwrite();
// Without this call a chart shows as a frame with its title.
registerChartsBackend();

const workbook: Workbook = {
  activeSheet: "s",
  sheets: [{ id: "s", name: "Sales", rowCount: 4, columns: [
    { key: "month", header: "Month", width: 96, type: "text" },
    { key: "revenue", header: "Revenue", width: 96, type: "number" },
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
it and call `registerChartsBackend()` once, before or after you create grids.
To register by import only, import `@sheetwrite/charts/register`.

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
| `axes` | `{ xTitle, yTitle }`, the axis titles. |
| `legend` | `none`, `top`, `right`, `bottom` or `left`. |
| `anchor` | The top-left cell (`row`, `col`), the offset from that cell, and the size, all in CSS pixels. |
| `series` | One entry for each series: `values`, optional `categories`, and a `name` or a `nameRange`. |

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
