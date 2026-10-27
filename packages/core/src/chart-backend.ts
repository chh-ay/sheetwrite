import type { ChartViewProvider, ChartViewProviderFactory } from "./types/chartProvider.js";
import type { Store } from "./types/store.js";

let chartViewProviderFactory: ChartViewProviderFactory | null = null;

/** Register an optional chart provider; `null` removes the current provider. */
export function setChartViewProviderFactory(factory: ChartViewProviderFactory | null): void {
  chartViewProviderFactory = factory;
}

/**
 * Open cached chart views through the optional backend. Import
 * `@sheetwrite/charts/register` or call its `registerChartsBackend` first.
 * Throws if no provider is registered. The caller must dispose the result.
 */
export function openChartViews(store: Store): ChartViewProvider {
  if (!chartViewProviderFactory) {
    throw new Error("Sheetwrite: no chart backend registered; import @sheetwrite/charts/register");
  }
  return chartViewProviderFactory(store);
}
