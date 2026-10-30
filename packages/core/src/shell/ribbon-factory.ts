// Public wrapper over the same Ribbon class the grid mounts with
// `config.ribbon`, so the shell and the built-in chrome cannot drift.

import { Ribbon } from "../ribbon/ribbon.js";
import type { CommandFlags, Grid, IconOverrides, RibbonConfig } from "../types/grid.js";
import type { ShellPiece } from "./formula-controls.js";

/** Options for {@link createRibbon}. */
export interface RibbonOptions extends RibbonConfig {
  /** Return keyboard focus to the grid after a pick or Escape (default: focus `host`). */
  focusGrid?: () => void;
  /** Called with the new height after the ribbon is minimized or expanded. */
  onHeightChange?: (height: number) => void;
  /** Replace built-in icons by glyph name, as `GridConfig.icons`. */
  icons?: IconOverrides;
  /** `GridConfig` switches that choose commands (default: all but Export). */
  flags?: CommandFlags;
}

/**
 * Mount an Excel-style ribbon (Home, Insert, Data, View) bound to
 * `grid.actions`, in normal document flow. It renders the same commands as
 * the toolbar, in a full or a compact layout. Groups shrink, then collapse into
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
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    ...(options.compactWidth === undefined ? {} : { compactWidth: options.compactWidth }),
    onHeightChange: (height) => options.onHeightChange?.(height),
    ...(options.icons === undefined ? {} : { icons: options.icons }),
    ...(options.flags === undefined ? {} : { flags: options.flags }),
  });
  return { element: ribbon.element, destroy: () => ribbon.destroy() };
}
