import { SheetwriteError } from "./errors.js";
import type { ChartRenderer, ChartViewProvider } from "./types/chart.js";
import type { ChartRendererFactory, ChartViewProviderFactory, Store } from "./types/store.js";

let chartViewProviderFactory: ChartViewProviderFactory | null = null;
let chartRendererFactory: ChartRendererFactory | null = null;

/** Set the chart provider that the charts add-on installs; `null` clears it. */
export function setChartViewProviderFactory(factory: ChartViewProviderFactory | null): void {
  chartViewProviderFactory = factory;
}

/**
 * Set the renderer that draws charts in the grid's object layer; `null`
 * removes it. Grids created later use it. Without a renderer, the grid draws
 * a plain frame with the chart title.
 */
export function setChartRendererFactory(factory: ChartRendererFactory | null): void {
  chartRendererFactory = factory;
}

/** Create the registered chart renderer for one grid, or `null` if none is registered. */
export function createChartRenderer(store: Store): ChartRenderer | null {
  return chartRendererFactory ? chartRendererFactory(store) : null;
}

/**
 * Open cached chart views through the charts add-on. Call
 * `initSheetwrite({ addons: [chartsAddon()] })` from `@sheetwrite/charts` first.
 * Throws a `SheetwriteError` with code `"optional-backend-unavailable"` if the
 * add-on is not installed. The caller must dispose the result.
 */
export function openChartViews(store: Store): ChartViewProvider {
  if (!chartViewProviderFactory) {
    throw new SheetwriteError(
      "optional-backend-unavailable",
      "chart-view",
      "Sheetwrite: charts add-on not installed. Install @sheetwrite/charts and call initSheetwrite({ addons: [chartsAddon()] }) before calling openChartViews.",
      { context: { backend: "charts" }, retryable: false },
    );
  }

  return chartViewProviderFactory(store);
}
