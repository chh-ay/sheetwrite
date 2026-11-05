// The part of the dashboard view that every grid carries: it decides WHEN the
// view is needed. The view (dashboard-view.ts and what it imports) loads as
// its own chunk the first time a dashboard sheet is active (#231).

import { isDashboard } from "../dashboard.js";
import type { Grid } from "../types/grid.js";
import type { DashboardView } from "./dashboard-view.js";

/** Shows the dashboard view over the cells while a dashboard is the active sheet. */
export interface DashboardViewHook {
  /** Show or hide the view for the active sheet; also called when editability changes. */
  sync(): void;
  dispose(): void;
}

/**
 * Attach the hook to `grid`. The view covers `viewport`, the element that
 * holds the cells, so the toolbar, the side panel and the tabs stay usable.
 */
export function attachDashboardView(
  grid: Grid,
  viewport: HTMLElement,
  readOnly: () => boolean,
): DashboardViewHook {
  let view: DashboardView | null = null;
  let loading = false;
  let disposed = false;

  const sync = (): void => {
    const sheet = grid.getActiveSheet();
    const active = isDashboard(grid.store.getWorkbook().sheets.find((item) => item.id === sheet));
    if (view !== null) {
      view.show(active ? sheet : null, readOnly());
      return;
    }
    if (!active || loading) return;

    loading = true;
    // A failed load stays a rejected promise for the host's unhandled-rejection path.
    void import("./dashboard-view.js").then(
      (module) => {
        loading = false;
        if (disposed) return;
        view = module.mountDashboardView(grid, viewport);
        sync();
      },
      (error: unknown) => {
        // The next sync tries again.
        loading = false;
        throw error;
      },
    );
  };

  const stopSheet = grid.on("active-sheet", sync);
  const stopChange = grid.on("change", sync);
  sync();
  return {
    sync,
    dispose() {
      disposed = true;
      stopSheet();
      stopChange();
      view?.dispose();
    },
  };
}
