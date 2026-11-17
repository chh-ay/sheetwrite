// The range AutoSum sums for a cell: the run of numbers right above it, or
// else the run right to its left, as Excel's AutoSum picks it. The AutoSum
// command and formula suggestions both read it, so they never disagree.

import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar } from "./types/cell.js";
import type { Range, SheetId } from "./types/coordinates.js";
import type { Store } from "./types/store.js";

/** Cells read per window while scanning for the start of the run. */
const CHUNK_CELLS = 4_096;

/**
 * Where the run of numbers that ends right before `row`, `col` starts, going
 * up (`vertical`) or left: the first row or column of the run, or the
 * cell's own row or column when the cell before it holds no number.
 */
function numericStart(
  store: Store,
  sheet: SheetId,
  at: { row: number; col: number },
  vertical: boolean,
): number {
  const { row, col } = at;
  let end = vertical ? row : col;
  const origin = end;
  while (end > 0) {
    const start = Math.max(0, end - CHUNK_CELLS);
    const columns = vertical
      ? [col]
      : Array.from({ length: end - start }, (_, index) => start + index);
    const window = store.getDataWindow?.(
      sheet,
      vertical ? { start, end } : { start: row, end: row + 1 },
      columns,
    );

    let values: ArrayLike<CellScalar>;
    if (window) values = window.values;
    else {
      const coordinates =
        columns.length === 1 && vertical
          ? Array.from({ length: end - start }, (_, index) => ({ row: start + index, col }))
          : columns.map((column) => ({ row, col: column }));

      const engine = storeEngine(store);
      // Custom stores without canonical windows retain their scalar data-address contract.
      const cells = engine
        ? engine.captureResolvedCells(sheet, coordinates)
        : coordinates.map((coordinate) => store.getCell({ sheet, ...coordinate }));
      values = cells.map((cell) => cell.resolved);
    }

    for (let index = values.length - 1; index >= 0; index--) {
      if (typeof values[index] !== "number") return start + index + 1;
    }

    end = start;
  }

  return origin === 0 ? origin : end;
}

/**
 * The range AutoSum sums for the cell at data position `row`, `col`: the
 * numbers right above it, or else the numbers right to its left; `null`
 * when neither cell next to it holds a number.
 */
export function autoSumRange(store: Store, sheet: SheetId, row: number, col: number): Range | null {
  const firstRow = numericStart(store, sheet, { row, col }, true);
  const vertical = firstRow < row;
  const firstCol = vertical ? col : numericStart(store, sheet, { row, col }, false);
  if (!vertical && firstCol === col) return null;

  return {
    sheet,
    start: { row: vertical ? firstRow : row, col: firstCol },
    end: { row: vertical ? row - 1 : row, col: vertical ? col : col - 1 },
  };
}
