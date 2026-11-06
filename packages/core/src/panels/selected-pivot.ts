// The worksheet pivot under the active cell. The ribbon asks at every
// selection change, so the answer comes from the engine's output rectangles
// and reads no cells.

import { selectionCell } from "../selection.js";
import { storeEngine } from "../store/engine-registry.js";
import type { Range } from "../types/coordinates.js";
import type { Grid } from "../types/grid.js";

/** A worksheet pivot and the cells its output covers. */
interface PlacedPivot {
  readonly id: string;
  readonly range: Range;
}

/** The worksheet pivot whose placed output holds the active cell, or null. */
export function selectedPivot(grid: Grid): PlacedPivot | null {
  const cell = selectionCell(grid.getSelection());
  if (cell === null) return null;

  const outputs = storeEngine(grid.store)?.pivotOutputs(cell.sheet) ?? [];
  const hit = outputs.find(
    ({ range }) =>
      cell.row >= range.start.row &&
      cell.row <= range.end.row &&
      cell.col >= range.start.col &&
      cell.col <= range.end.col,
  );
  return hit ?? null;
}
