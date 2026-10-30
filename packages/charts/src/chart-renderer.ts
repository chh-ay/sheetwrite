import type { ChartRef, ChartRenderer, MountedChart, Store } from "@sheetwrite/core";

import { renderChartSvg } from "./chart-svg.js";
import { createChartViewCache } from "./view-cache.js";

/**
 * Creates the SVG chart renderer for one store. All mounted charts share one
 * view cache. A chart redraws after a chart-change event names it, or after a
 * resize, at most once per animation frame. Scrolling never redraws a chart.
 *
 * @example
 * ```ts
 * import { createChartRenderer } from "@sheetwrite/charts";
 * import type { ChartRef, Store } from "@sheetwrite/core";
 *
 * function showChart(store: Store, host: HTMLElement, chart: ChartRef) {
 *   const renderer = createChartRenderer(store);
 *   const mounted = renderer.mount(host, chart, { width: 320, height: 200 });
 *   return () => {
 *     mounted.dispose();
 *     renderer.dispose();
 *   };
 * }
 * ```
 */
export function createChartRenderer(store: Store): ChartRenderer {
  const views = createChartViewCache(store);
  const mounted = new Set<MountedChart>();

  return {
    mount(host, chart, size) {
      // Frames come from the host's own window, which differs from the global one inside an iframe.
      const hostWindow = host.ownerDocument.defaultView ?? globalThis;
      let width = size.width;
      let height = size.height;
      let frame: number | null = null;

      const draw = (): void => {
        frame = null;
        const view = views.get(chart);
        if (view)
          host.replaceChildren(
            renderChartSvg(view, { width, height }, { document: host.ownerDocument }),
          );
        else host.replaceChildren();
      };

      // Edits and resizes can arrive many times in one frame; the chart only needs the last state.
      const scheduleDraw = (): void => {
        if (frame === null) frame = hostWindow.requestAnimationFrame(draw);
      };

      const isThisChart = (other: ChartRef): boolean =>
        other.sheet === chart.sheet && other.id === chart.id;
      const unsubscribe = views.subscribe((event) => {
        if (event.charts.some(isThisChart)) scheduleDraw();
      });

      draw();

      const handle: MountedChart = {
        resize(nextWidth, nextHeight) {
          if (nextWidth === width && nextHeight === height) return;

          width = nextWidth;
          height = nextHeight;
          scheduleDraw();
        },
        dispose() {
          if (!mounted.delete(handle)) return;

          if (frame !== null) hostWindow.cancelAnimationFrame(frame);
          frame = null;
          unsubscribe();
          host.replaceChildren();
        },
      };
      mounted.add(handle);
      return handle;
    },
    dispose() {
      for (const handle of [...mounted]) handle.dispose();
      views.dispose();
    },
  };
}
