import {
  type ChartChangeEvent,
  type ChartRef,
  type ChartView,
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
export interface ChartViewCache {
  /** Resolved view for the chart, or `null` when the sheet has no chart with that ID. */
  get(chart: ChartRef): ChartView | null;
  /** Observe charts whose cached views were invalidated; returns the unsubscribe function. */
  subscribe(listener: (event: ChartChangeEvent) => void): () => void;
  /** Stop observing the store and release every cached view. */
  dispose(): void;
}

function chartKey(chart: ChartRef): string {
  return `${chart.sheet}\u0000${chart.id}`;
}

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
  const views = new Map<string, ChartView | null>();
  const listeners = new Set<(event: ChartChangeEvent) => void>();
  let isDisposed = false;

  const unsubscribeStore = subscribeChartChanges(store, (event: ChartChangeEvent) => {
    for (const chart of event.charts) views.delete(chartKey(chart));

    for (const listener of [...listeners]) listener(event);
  });

  const assertLive = (): void => {
    if (isDisposed) throw new Error("Sheetwrite: chart view cache was disposed");
  };

  return {
    get(chart) {
      assertLive();

      const key = chartKey(chart);
      const cached = views.get(key);
      if (cached !== undefined) return cached;

      const view = resolveChartView(store, chart.sheet, chart.id);
      views.set(key, view);
      return view;
    },
    subscribe(listener) {
      assertLive();

      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (isDisposed) return;

      isDisposed = true;
      unsubscribeStore();
      views.clear();
      listeners.clear();
    },
  };
}
