/**
 * Merge and Merge & Center. Excel's warning before values are dropped is in
 * `merge-warning.ts`, which loads the first time the toolbar, the ribbon or
 * the context menu merges.
 */

import { storeEngine } from "./store/engine-registry.js";
import { mergeCrossesFreeze, mergesOverlap } from "./store/ranges.js";
import type { StyleActionsDeps } from "./style-actions.js";
import type { CellValue } from "./types/cell.js";
import type { DocumentOp, SnapshotCell } from "./types/document.js";

/** A merge's inclusive bounds, in rows and columns of the active sheet. */
export interface MergeBounds {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/**
 * Merge the selected range now, keeping only its upper-left value, as Excel's
 * `Range.Merge` does with `DisplayAlerts = False`.
 */
export function mergeSelection(deps: StyleActionsDeps, center: boolean): void {
  const merge = mergeBounds(deps);
  if (merge !== null) commitMerge(deps, merge, center);
}

/** The selected range as a merge, or null when it cannot merge. */
export function mergeBounds(deps: StyleActionsDeps): MergeBounds | null {
  if (deps.readOnly()) return null;
  const activeSheet = deps.activeSheet();
  if (deps.loadable?.hasView(activeSheet)) return null;

  const sel = deps.selection().toSelection(activeSheet);
  if (sel?.kind !== "range") return null;
  const { start, end } = sel.range;
  const merge = {
    r0: Math.min(start.row, end.row),
    c0: Math.min(start.col, end.col),
    r1: Math.max(start.row, end.row),
    c1: Math.max(start.col, end.col),
  };
  if (merge.r0 === merge.r1 && merge.c0 === merge.c1) return null;
  const sheet = deps.sheet();
  if (
    mergeCrossesFreeze(sheet, merge) ||
    deps.merges().some((candidate) => mergesOverlap(merge, candidate))
  ) {
    return null;
  }
  return merge;
}

/** Merge `merge` as one undoable step, centering its text for Merge & Center. */
export function commitMerge(deps: StyleActionsDeps, merge: MergeBounds, center: boolean): void {
  const activeSheet = deps.activeSheet();
  const sheet = deps.sheet();
  const range = {
    sheet: activeSheet,
    start: { row: merge.r0, col: merge.c0 },
    end: { row: merge.r1, col: merge.c1 },
  };
  const engine = storeEngine(deps.store);
  // Per-cell operations preserve policy issue indices and partial spill rejection.
  const scalarWrites =
    !engine ||
    Boolean(
      sheet.validationRules?.length ||
      sheet.protectedRanges?.length ||
      engine.hasSpillChildren(range),
    );
  const cells: SnapshotCell[] = [];
  const patches: DocumentOp[] = [{ op: "addMerge", sheet: activeSheet, merge }];
  for (let row = merge.r0; row <= merge.r1; row++) {
    for (let col = merge.c0; col <= merge.c1; col++) {
      if (row === merge.r0 && col === merge.c0) continue;
      const value: CellValue = { kind: "literal", value: null };
      if (scalarWrites) {
        patches.push({
          op: "set",
          addr: { sheet: activeSheet, row: deps.toDataRow(row), col },
          value,
        });
      } else cells.push({ rowOffset: row - merge.r0, colOffset: col - merge.c0, value });
    }
  }

  if (cells.length > 0) patches.push({ op: "setRange", range, cells });
  if (center)
    patches.push({
      op: "setRangeStyle",
      range: {
        sheet: activeSheet,
        start: { row: merge.r0, col: merge.c0 },
        end: { row: merge.r0, col: merge.c0 },
      },
      style: { align: "center" },
    });

  deps.commit(patches);
}
