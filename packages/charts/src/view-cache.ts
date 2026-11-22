import {
  type ChartChangeEvent,
  type ChartChangeListener,
  type ChartView,
  type ChartViewProvider,
  type SheetId,
  resolveChartView,
  type Store,
  subscribeChartChanges,
} from "@sheetwrite/core";

/**
 * Resolved chart views for one store, refreshed only by chart-change events.
 *
 * Listeners run after the changed charts are invalidated, so `get` inside a
 * listener always resolves the committed cell data.
 */
export type ChartViewCache = ChartViewProvider;

/**
 * Creates the per-store chart view cache a chart renderer reads from.
 *
 * Views resolve lazily on first `get` and stay cached until a chart-change
 * event names that chart, so repeated frames never reread cells.
 *
 * @example
 * ```ts
 * import { createChartViewCache, type ChartView } from "@sheetwrite/charts";
 * import type { SheetId, Store } from "@sheetwrite/core";
 *
 * function watchChart(
 *   store: Store,
 *   sheet: SheetId,
 *   id: string,
 *   render: (view: ChartView | null) => void,
 * ) {
 *   const charts = createChartViewCache(store);
 *   render(charts.get({ sheet, id }));
 *   const unsubscribe = charts.subscribe((event) => {
 *     if (event.charts.some((chart) => chart.sheet === sheet && chart.id === id)) {
 *       render(charts.get({ sheet, id }));
 *     }
 *   });
 *   return () => {
 *     unsubscribe();
 *     charts.dispose();
 *   };
 * }
 * ```
 */
export function createChartViewCache(store: Store): ChartViewCache {
  const views = new Map<SheetId, Map<string, ChartView | null>>();
  const listeners = new Set<ChartChangeListener>();
  let is_disposed = false;

  const unsubscribe_store = subscribeChartChanges(store, (event: ChartChangeEvent) => {
    for (const chart of event.charts) views.get(chart.sheet)?.delete(chart.id);

    for (const listener of listeners) listener(event);
  });

  const assert_live = (): void => {
    // The Vite bundler fixture checks this text to detect the optional chart chunk.
    if (is_disposed) throw new Error("Sheetwrite: chart view cache was disposed");
  };

  return {
    get(chart) {
      assert_live();

      let sheet_views = views.get(chart.sheet);
      const cached = sheet_views?.get(chart.id);
      if (cached !== undefined) return cached;

      const view = resolveChartView(store, chart.sheet, chart.id);
      if (!sheet_views) {
        sheet_views = new Map<string, ChartView | null>();
        views.set(chart.sheet, sheet_views);
      }
      sheet_views.set(chart.id, view);
      return view;
    },
    subscribe(listener) {
      assert_live();

      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (is_disposed) return;

      is_disposed = true;
      unsubscribe_store();
      views.clear();
      listeners.clear();
    },
  };
}
