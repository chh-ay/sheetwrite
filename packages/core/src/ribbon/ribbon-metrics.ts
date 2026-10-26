// The ribbon's fixed heights, apart from the ribbon itself: the grid reserves
// this space before the lazily loaded ribbon arrives, so the page never
// shifts when it mounts. Keep in step with `.sheetwrite-ribbon-tabs` and
// `.sheetwrite-ribbon-panel` in styles.css.

/** Tab row height in CSS pixels. */
export const RIBBON_TAB_ROW_HEIGHT = 30;

/** Group panel height in CSS pixels. */
export const RIBBON_PANEL_HEIGHT = 92;

/** Height of an expanded ribbon: tab row plus panel. */
export const RIBBON_EXPANDED_HEIGHT = RIBBON_TAB_ROW_HEIGHT + RIBBON_PANEL_HEIGHT;
