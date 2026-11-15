/** Shared by the forced layout page and its driver. */
export const FORCED_LAYOUT_ACTIONS = [
  "scroll",
  "arrow-down",
  "edit-open",
  "edit-commit",
  "editor-scroll",
  "edit-type",
  "bar-type",
  "scroll-refresh",
  "arrow-down-refresh",
  "edit-commit-refresh",
] as const;
export type ForcedLayoutAction = (typeof FORCED_LAYOUT_ACTIONS)[number];

/**
 * Actions that paint with `grid.refresh()` and run their steps back to back in
 * one task, as the render benchmark does: no frame runs between two steps.
 */
export const SYNCHRONOUS_ACTIONS: Readonly<Record<ForcedLayoutAction, boolean>> = {
  scroll: false,
  "arrow-down": false,
  "edit-open": false,
  "edit-commit": false,
  "editor-scroll": false,
  "edit-type": false,
  "bar-type": false,
  "scroll-refresh": true,
  "arrow-down-refresh": true,
  "edit-commit-refresh": true,
};

/**
 * Actions that type one character per step with a formula bar beside the
 * grid: into the open cell editor, or into the formula bar.
 */
export const TYPING_ACTIONS: Readonly<Record<ForcedLayoutAction, boolean>> = {
  scroll: false,
  "arrow-down": false,
  "edit-open": false,
  "edit-commit": false,
  "editor-scroll": false,
  "edit-type": true,
  "bar-type": true,
  "scroll-refresh": false,
  "arrow-down-refresh": false,
  "edit-commit-refresh": false,
};

export const FORCED_LAYOUT_ROWS = 100_000;

export function isForcedLayoutAction(value: string): value is ForcedLayoutAction {
  return FORCED_LAYOUT_ACTIONS.some((action) => action === value);
}

/** User Timing marks that bracket one measured step in the trace. */
export function stepMarkName(step: number, edge: "start" | "end"): string {
  return `forced-layout:${step}:${edge}`;
}
