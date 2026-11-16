// Where the grid draws an AutoFilter header cell's filter button. The
// commands and the dropdown load later, from autofilter-actions.ts.

/** Edge of the filter button, in CSS pixels at zoom 1. */
const FILTER_BUTTON_SIZE = 16;

/**
 * Where an AutoFilter header cell's filter button sits: a square at the
 * cell's right edge, as in Excel. `cell` and the result share a coordinate space.
 */
export function filterButtonRect(cell: { x: number; y: number; w: number; h: number }): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const size = Math.max(0, Math.min(FILTER_BUTTON_SIZE, cell.h - 4, cell.w - 4));
  return { x: cell.x + cell.w - size - 2, y: cell.y + (cell.h - size) / 2, w: size, h: size };
}
