# @sheetwrite/charts

Optional live chart views for `@sheetwrite/core`. Core does not depend on this package.

Charts are part of the workbook document. Each sheet keeps its chart definitions in `Sheet.charts`, and the `setChart` and `removeChart` document operations change them. This package gives a renderer the resolved data for those charts. It does not draw charts.

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
