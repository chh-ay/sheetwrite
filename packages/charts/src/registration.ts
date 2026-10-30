import { setChartViewProviderFactory } from "@sheetwrite/core";

import { createChartViewCache } from "./view-cache.js";

/**
 * Register the chart view cache as the core chart view provider, so
 * `openChartViews(store)` returns live chart views.
 *
 * @example
 * ```ts
 * import { registerChartsBackend } from "@sheetwrite/charts";
 * import { openChartViews, type Store } from "@sheetwrite/core";
 *
 * registerChartsBackend();
 *
 * function salesChartValues(store: Store) {
 *   const charts = openChartViews(store);
 *   const values = charts.get({ sheet: "s", id: "sales" })?.series[0]?.values ?? [];
 *   charts.dispose();
 *   return values;
 * }
 * ```
 */
export function registerChartsBackend(): void {
  setChartViewProviderFactory(createChartViewCache);
}
