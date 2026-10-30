import { SheetwriteError } from "./errors.js";
import type { ChartRenderer, ChartViewProvider } from "./types/chart.js";
import type { ChartRendererFactory, ChartViewProviderFactory, Store } from "./types/store.js";

let chartViewProviderFactory: ChartViewProviderFactory | null = null;
let chartRendererFactory: ChartRendererFactory | null = null;

/** Register an optional chart provider; `null` removes the current provider. */
export function setChartViewProviderFactory(factory: ChartViewProviderFactory | null): void {
  chartViewProviderFactory = factory;
}

/**
 * Register the renderer that draws charts in the grid's object layer; `null`
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
 * Open cached chart views through the optional backend. Import
 * `@sheetwrite/charts/register` or call its `registerChartsBackend` first.
 * Throws a `SheetwriteError` with code `"optional-backend-unavailable"` if no
 * provider is registered. The caller must dispose the result.
 */
export function openChartViews(store: Store): ChartViewProvider {
  if (!chartViewProviderFactory) {
    throw new SheetwriteError(
      "optional-backend-unavailable",
      "chart-view",
      "Sheetwrite: chart backend not registered. Install @sheetwrite/charts and import @sheetwrite/charts/register before calling openChartViews.",
      { context: { backend: "charts" }, retryable: false },
    );
  }

  return chartViewProviderFactory(store);
}
