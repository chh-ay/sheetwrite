import { nextTurn, type Scope } from "./scope.js";
import type { SelRect } from "./selection.js";
import type { SheetId } from "./types/coordinates.js";
import type { SelectionSummary } from "./types/grid.js";
import type { Store } from "./types/store.js";

/** About one frame's work per read; larger selections yield between reads. */
const SUMMARY_CELLS_PER_READ = 65_536;

/** Summaries use captured coordinates and stop before a replaced document can be read. */
export async function summarizeRects(
  store: Store,
  sheet: SheetId,
  columnCount: number,
  rects: readonly SelRect[],
  run: Scope,
): Promise<SelectionSummary> {
  run.signal.throwIfAborted();
  let count = 0;
  let numeric_count = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let read_since_yield = 0;

  for (const rect of rects) {
    // Whole-row selections extend past the last column; nothing lives there.
    const last_col = Math.min(rect.c1, columnCount - 1);
    if (last_col < rect.c0) continue;

    const cols: number[] = [];
    for (let col = rect.c0; col <= last_col; col++) cols.push(col);
    const rows_per_read = Math.max(1, Math.floor(SUMMARY_CELLS_PER_READ / cols.length));

    for (let start = rect.r0; start <= rect.r1; start += rows_per_read) {
      if (read_since_yield >= SUMMARY_CELLS_PER_READ) {
        read_since_yield = 0;
        await nextTurn(run);
      }

      // Read view rows so filters match the status bar's visible selection.
      const end = Math.min(rect.r1 + 1, start + rows_per_read);
      const { values } = store.getVisibleWindow(sheet, { start, end }, cols);
      read_since_yield += values.length;

      for (let index = 0; index < values.length; index++) {
        const value = values[index];
        if (value === null || value === undefined || value === "") continue;
        count += 1;
        if (typeof value !== "number") continue;
        numeric_count += 1;
        sum += value;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
  }

  const has_numbers = numeric_count > 0;
  return {
    count,
    numericCount: numeric_count,
    sum,
    average: has_numbers ? sum / numeric_count : null,
    min: has_numbers ? min : null,
    max: has_numbers ? max : null,
  };
}
