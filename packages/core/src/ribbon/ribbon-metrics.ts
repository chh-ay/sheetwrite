// The fixed heights of the command chrome, apart from the chrome itself: the
// grid reserves this space before the lazily loaded ribbon or toolbar arrives,
// so the page never shifts when it mounts. Keep in step with
// `.sheetwrite-ribbon-tabs`, `.sheetwrite-ribbon-panel` and
// `.sheetwrite-command-toolbar` in styles.css.

import { SheetwriteError } from "../errors.js";
import type { GridConfig } from "../types/grid.js";

/** Tab row height in CSS pixels. */
export const RIBBON_TAB_ROW_HEIGHT = 30;

/** Group panel height in CSS pixels. */
export const RIBBON_PANEL_HEIGHT = 92;

/** One row of compact ribbon controls, including padding. */
export const RIBBON_COMPACT_PANEL_HEIGHT = 36;

/** Automatic layout switches below this width in CSS pixels. */
export const RIBBON_COMPACT_WIDTH = 768;

/** Height of an expanded ribbon: tab row plus panel. */
export const RIBBON_EXPANDED_HEIGHT = RIBBON_TAB_ROW_HEIGHT + RIBBON_PANEL_HEIGHT;

/** The toolbar's one row, the same height as a compact ribbon panel. */
export const TOOLBAR_HEIGHT = RIBBON_COMPACT_PANEL_HEIGHT;

/**
 * Reject a breakpoint that would make automatic layout unpredictable. Owners
 * call this before the lazy ribbon chunk loads, so bad input fails at the call.
 */
export function assertRibbonConfig(config: GridConfig["ribbon"]): void {
  if (typeof config !== "object" || config.compactWidth === undefined) return;
  if (Number.isFinite(config.compactWidth) && config.compactWidth > 0) return;

  throw new SheetwriteError(
    "invalid-argument",
    "create-grid",
    "Ribbon compactWidth must be a positive finite number",
  );
}
