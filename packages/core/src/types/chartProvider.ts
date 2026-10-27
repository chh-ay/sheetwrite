import type { ChartChangeListener, ChartRef } from "../charts-live.js";
import type { ChartView } from "./chart.js";
import type { Store } from "./store.js";

/** Cached chart views supplied by the optional charts package; renderers do not read cells. */
export interface ChartViewProvider {
  /** Resolve on first access; later accesses use the cached committed view. */
  get(chart: ChartRef): ChartView | null;
  /** Observe invalidation after cached views have been removed. */
  subscribe(listener: ChartChangeListener): () => void;
  /** Stop observing the store and release cached views. */
  dispose(): void;
}

/** Creates a provider owned and disposed by one renderer or host. */
export type ChartViewProviderFactory = (store: Store) => ChartViewProvider;
