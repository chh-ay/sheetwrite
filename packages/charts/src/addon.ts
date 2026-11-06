import type { SheetwriteAddon } from "@sheetwrite/core";

import { createChartRenderer } from "./chart-renderer.js";
import { createChartViewCache } from "./view-cache.js";

/**
 * The charts add-on. It makes core's `openChartViews(store)` return live chart
 * views, and grids created after `initSheetwrite` draw their charts as SVG.
 * Without it, a grid shows a plain frame with the chart title.
 *
 * @example
 * ```ts
 * import { chartsAddon } from "@sheetwrite/charts";
 * import { initSheetwrite, openChartViews, type Store } from "@sheetwrite/core";
 *
 * await initSheetwrite({ addons: [chartsAddon()] });
 *
 * function salesChartValues(store: Store) {
 *   const views = openChartViews(store);
 *   try {
 *     return views.get({ sheet: "sales", id: "revenue" })?.series[0]?.values ?? [];
 *   } finally {
 *     views.dispose();
 *   }
 * }
 * ```
 */
export function chartsAddon(): SheetwriteAddon {
  return {
    name: "charts",
    setup(context) {
      context.charts({ views: createChartViewCache, renderer: createChartRenderer });
    },
  };
}
