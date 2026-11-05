// Consolidates how shell inputs interpret selections and commit cell text.
// Everything here goes through the public `Grid` contract — never `Store`
// internals, never private grid DOM.

import { parseCellInput } from "../cell-input.js";
import type { CellInputSnapshot, Grid } from "../types/grid.js";

/**
 * Commit raw formula-bar text to the cell a snapshot was captured for. The
 * snapshot's data address (not the current selection) is the target, so a
 * selection change during editing can never retarget the write. Flows through
 * the grid's undoable commit path and read-only policy.
 */
export function commitCellInput(grid: Grid, snapshot: CellInputSnapshot, raw: string): void {
  const value = parseCellInput(raw, snapshot.format);
  grid.applyTransaction({
    patches: [{ op: "set", addr: snapshot.address, value }],
  });
}
