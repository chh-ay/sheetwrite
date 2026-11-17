/**
 * Excel's warning before a merge drops values, for Merge and Merge & Center
 * in the toolbar, the ribbon and the context menu (`GridActions.merge` with
 * `ask`). It loads on first use, with the dialog it opens.
 */

import { confirmDialog, type DialogHost } from "./dialog.js";
import { commitMerge, type MergeBounds, mergeBounds } from "./merge-command.js";
import type { StyleActionsDeps } from "./style-actions.js";

/** Excel's warning before a merge that drops values. */
const MERGE_WARNING = "Merging cells only keeps the upper-left value and discards other values.";

/** Cells read at once while counting the values a merge would cover. */
const MERGE_SCAN_CELLS = 65_536;

/**
 * Merge the selected range. As in Excel, when more than one of its cells
 * holds a value, a warning that only the upper-left value stays opens first,
 * and the merge happens only after OK.
 */
export function askToMerge(deps: StyleActionsDeps, center: boolean, dialogs: DialogHost): void {
  const merge = mergeBounds(deps);
  if (merge === null) return;
  if (countValues(deps, merge, 2) < 2) {
    commitMerge(deps, merge, center);
    return;
  }

  const warning = confirmDialog(dialogs, { title: "Merge Cells", message: MERGE_WARNING });
  void warning.result.then((ok) => {
    // The selection or the sheet may have changed while the warning was open.
    const now = mergeBounds(deps);
    if (
      ok &&
      now !== null &&
      now.r0 === merge.r0 &&
      now.c0 === merge.c0 &&
      now.r1 === merge.r1 &&
      now.c1 === merge.c1
    ) {
      commitMerge(deps, merge, center);
    }
  });
}

/** How many cells of `merge` hold a value, counted up to `limit`. */
function countValues(deps: StyleActionsDeps, merge: MergeBounds, limit: number): number {
  const sheet = deps.activeSheet();
  const cols = Array.from({ length: merge.c1 - merge.c0 + 1 }, (_, index) => merge.c0 + index);
  const band = Math.max(1, Math.floor(MERGE_SCAN_CELLS / cols.length));
  let count = 0;
  for (let start = merge.r0; start <= merge.r1; start += band) {
    const rows = { start, end: Math.min(merge.r1 + 1, start + band) };
    const { values } = deps.store.getVisibleWindow(sheet, rows, cols);
    for (let index = 0; index < values.length; index++) {
      const value = values[index];
      if (value !== null && value !== undefined && value !== "" && ++count >= limit) {
        return count;
      }
    }
  }
  return count;
}
