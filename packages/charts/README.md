# @sheetwrite/charts

Optional live chart views and SVG chart drawing for `@sheetwrite/core`. Core does not depend on this package.

Charts are part of the workbook document. Each sheet keeps its chart definitions in `Sheet.charts`, and the `setChart` and `removeChart` document operations change them. This package reads the resolved data for those charts and draws them as SVG in the grid.

## Install

```sh
npm install @sheetwrite/core @sheetwrite/charts
```

## Read chart views

`createChartViewCache(store)` returns one cache for one store:

```ts
import { createChartViewCache } from "@sheetwrite/charts";

const charts = createChartViewCache(store);
const view = charts.get({ sheet: "s", id: "sales" });

const unsubscribe = charts.subscribe((event) => {
  for (const chart of event.charts) redraw(charts.get(chart));
});

// When the chart surface closes:
unsubscribe();
charts.dispose();
```

- `get(chart)` returns the `ChartView` for the chart, or `null` when the sheet has no chart with that ID. The cache reads the cells on the first `get` only. The next calls return the same view until the chart changes.
- `subscribe(listener)` calls the listener when an edit changes the definition or the source cells of one or more charts. `event.charts` names those charts. Edits to other cells do not call the listener.
- The cache removes the old views before it calls the listeners, so `get` in a listener returns the new data.
- `dispose()` stops the cache. After `dispose`, `get` and `subscribe` throw.

A `ChartView` contains plain data. Each series has its values, categories, and number formats, and it shows if the source was truncated or refers to a deleted range (`#REF!`). Core reads at most `MAX_CHART_POINTS` points for each series.

When you replace the workbook, you get a new store. Make a new cache for the new store.

## Register with core

Core has `openChartViews(store)`, which returns the same `get`, `subscribe` and `dispose` API. It throws until a chart package is registered. Import `@sheetwrite/charts/register` once, or call `registerChartsBackend()`. Registration also sets the chart renderer, so grids that you create after it draw their charts. Without it, a grid shows a plain frame with the chart title:

```ts
import "@sheetwrite/charts/register";
import { openChartViews } from "@sheetwrite/core";

const charts = openChartViews(store);
const view = charts.get({ sheet: "s", id: "sales" });
```

The `@sheetwrite/charts` root entry does not register anything when you import it.

## Draw a chart

`renderChartSvg(view, { width, height })` returns an `<svg>` element for one `ChartView`. It draws column, bar, line, area, pie, doughnut and scatter charts:

```ts
import { renderChartSvg } from "@sheetwrite/charts";

host.replaceChildren(renderChartSvg(view, { width: 320, height: 200 }));
```

- Value axes use rounded steps (1, 2, 2.5 or 5 × 10ⁿ), and their labels use the number format of the source cells.
- Empty, text and error cells are gaps. Negative values go below the zero line.
- The chart shows a note when a source was truncated or refers to a deleted range (`#REF!`).
- Pie and doughnut charts use the first series only.
- Scatter charts use the categories as x values when they are numbers.
- Line, area and scatter series with more points than the plot has pixels keep only the lowest and highest point of each pixel column.
- The element has `role="img"`, a `<title>` with the chart title and kind, and a `<desc>` with the series names and point counts.

Series colors come from the CSS variables `--sheetwrite-chart-1` to `--sheetwrite-chart-8`, and text uses `--sheetwrite-fg`. Core styles set these variables for the light and dark themes. Set them on the grid or the page to change the colors.

`createChartRenderer(store)` is the renderer that `registerChartsBackend()` gives to core. A grid uses it to draw each chart in its box. A chart draws again only when an edit changes it or its box size changes, at most once in each animation frame.
