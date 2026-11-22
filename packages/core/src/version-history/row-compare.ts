import type { StoreDataEngine } from "../store/data-engine.js";
import type { SheetId } from "../types/coordinates.js";
import { HistoryError } from "./codec.js";
import type { HistoryDiffRequest } from "./diff.js";
import { MAX_HISTORY_DIFF_ENTRIES, styleTables, transferOf, WINDOW_CELLS } from "./diff.js";

/** A rectangle of cells, inclusive. */
interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/**
 * Sorted rows of `rect` on `sheet` where the two engines' cells differ in
 * source or style, compared by position. Styles are compared by content.
 */
export type RowComparer = (
  left: StoreDataEngine,
  right: StoreDataEngine,
  sheet: SheetId,
  rect: Rect,
) => number[];

/**
 * Load the history diff kernel and return a row comparer that runs on it.
 * `source` overrides where its WASM comes from, as `HistoryDiffRequest.kernel`.
 */
export async function loadRowComparer(source?: HistoryDiffRequest["kernel"]): Promise<RowComparer> {
  const { DiffKernel, loadHistoryKernel: load_history_kernel } =
    await import("@sheetwrite/wasm/history");
  await load_history_kernel(source);

  return (left, right, sheet, rect) => {
    const rows = rect.r1 - rect.r0 + 1;
    const cols = rect.c1 - rect.c0 + 1;
    const window_rows = Math.max(1, Math.floor(WINDOW_CELLS / cols));
    const kernel = new DiffKernel(MAX_HISTORY_DIFF_ENTRIES);

    try {
      const slot = kernel.addSheet(rows, cols, true);
      const [left_styles, right_styles] = styleTables(left, right);
      kernel.setStyles(left_styles, right_styles);

      const changed: number[] = [];
      for (let row0 = 0; row0 < rows; row0 += window_rows) {
        const count = Math.min(window_rows, rows - row0);
        const loaded =
          kernel.loadBefore(transferOf(left, sheet, rect.r0 + row0, rect.c0, count, cols)) &&
          kernel.loadAfter(transferOf(right, sheet, rect.r0 + row0, rect.c0, count, cols));
        if (!loaded) {
          throw new HistoryError("integrity", "The diff kernel rejected a rebuilt window");
        }

        // A full page of changes returns early; continue from the cell it reached.
        for (let next = 0; next < count * cols;) {
          next = kernel.compare(slot, true, 0, 0, count, cols, row0, 0, row0, 0, next);
          for (const row of kernel.pageRows()) {
            if (changed[changed.length - 1] !== rect.r0 + row) {
              changed.push(rect.r0 + row);
            }
          }
        }
      }

      return changed;
    } finally {
      kernel.free();
    }
  };
}
