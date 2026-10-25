// Public wrapper over the same Ribbon class the grid mounts with
// `config.ribbon`, so the shell and the built-in chrome cannot drift.

import { Ribbon } from "../ribbon/ribbon.js";
import type { Grid } from "../types/grid.js";
import type { ShellPiece } from "./formula-controls.js";

/** Options for {@link createRibbon}. */
export interface RibbonOptions {
  /** Return keyboard focus to the grid after a pick or Escape (default: focus `host`). */
  focusGrid?: () => void;
  /** Called with the new height after the ribbon is minimized or expanded. */
  onHeightChange?: (height: number) => void;
}

/**
 * Mount an Excel-style ribbon (Home, Insert, Data, View) bound to
 * `grid.actions`, in normal document flow. Groups shrink, then collapse into
 * dropdowns, as the host narrows. Returns the piece with an idempotent
 * `destroy`.
 */
export function createRibbon(
  host: HTMLElement,
  grid: Grid,
  options: RibbonOptions = {},
): ShellPiece {
  const ribbon = new Ribbon(host, grid, {
    ...(options.focusGrid === undefined ? {} : { focusGrid: options.focusGrid }),
    onHeightChange: (height) => options.onHeightChange?.(height),
  });
  return { element: ribbon.element, destroy: () => ribbon.destroy() };
}
