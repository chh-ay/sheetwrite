// Consolidates how shell inputs interpret selections and commit cell text.
// Everything here goes through the public `Grid` contract — never `Store`
// internals, never private grid DOM.

import { parseCellEntry } from "../cell-input.js";
import type { CellInputSnapshot, Grid } from "../types/grid.js";

/**
 * Commit raw formula-bar text to the cell a snapshot was captured for. The
 * snapshot's data address (not the current selection) is the target, so a
 * selection change during editing can never retarget the write. Flows through
 * the grid's undoable commit path and read-only policy. In a `general`
 * column an unformatted cell gets the format Excel's General gives the entry.
 */
export function commitCellInput(grid: Grid, snapshot: CellInputSnapshot, raw: string): void {
  const style = grid.store.getCell(snapshot.address).style;
  const { value, numberFormat } = parseCellEntry(raw, snapshot.format, style.numberFormat);
  const general = style.numberFormat === undefined || style.numberFormat === "General";
  grid.applyTransaction({
    patches: [
      numberFormat !== undefined && general
        ? { op: "set", addr: snapshot.address, value, style: { ...style, numberFormat } }
        : { op: "set", addr: snapshot.address, value },
    ],
  });
}
