import type { ChartRenderer, MountedChart, SheetwriteAddon, Store } from "@sheetwrite/core";

import { createChartViewCache } from "./view-cache.js";

/**
 * The chart renderer of one grid. The SVG drawing code loads when the grid
 * creates it; a chart mounted before then draws as soon as it loads.
 */
function createLazyChartRenderer(store: Store): ChartRenderer {
 let renderer: ChartRenderer | undefined;
 let isDisposed = false;

 const loaded = import("./chart-renderer.js").then(({ createChartRenderer }) => {
  if (!isDisposed) renderer = createChartRenderer(store);
  return renderer;
 });

 return {
  mount(host, chart, size) {
   if (renderer) return renderer.mount(host, chart, size);

   let width = size.width;
   let height = size.height;
   let mounted: MountedChart | undefined;
   let isUnmounted = false;

   void loaded.then((ready) => {
    if (ready && !isUnmounted) mounted = ready.mount(host, chart, { width, height });
   });

   return {
    resize(nextWidth, nextHeight) {
     width = nextWidth;
     height = nextHeight;
     mounted?.resize(nextWidth, nextHeight);
    },
    dispose() {
     isUnmounted = true;
     mounted?.dispose();
    },
   };
  },
  dispose() {
   isDisposed = true;
   renderer?.dispose();
  },
 };
}

/**
 * The charts add-on. It makes core's `openChartViews(store)` return live chart
 * views, and grids created after `initSheetwrite` draw their charts as SVG.
 * Without it, a grid shows a plain frame with the chart title. The SVG code
 * loads when the first grid is created, not with the first chunk.
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
   context.charts({ views: createChartViewCache, renderer: createLazyChartRenderer });
  },
 };
}
