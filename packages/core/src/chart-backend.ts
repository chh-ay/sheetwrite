import { SheetwriteError } from "./errors.js";
import type { ChartViewProvider } from "./types/chart.js";
import type { ChartViewProviderFactory, Store } from "./types/store.js";

let chartViewProviderFactory: ChartViewProviderFactory | null = null;

/** Register an optional chart provider; `null` removes the current provider. */
export function setChartViewProviderFactory(factory: ChartViewProviderFactory | null): void {
  chartViewProviderFactory = factory;
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
