/**
 * Merge and Merge & Center, with Excel's warning before values are dropped.
 * The merge itself is in the first load; the warning's dialog loads the first
 * time it opens.
 */

import { colToA1 } from "./a1.js";
import { cellDisplayText } from "./cell-input.js";
import { storeEngine } from "./store/engine-registry.js";
import { mergeCrossesFreeze, mergesOverlap } from "./store/ranges.js";
import type { StyleActionsDeps } from "./style-actions.js";
import type { CellValue } from "./types/cell.js";
import type { DocumentOp, SnapshotCell } from "./types/document.js";

/** Excel's warning before a merge that drops values. */
const MERGE_WARNING = "Merging cells only keeps the upper-left value and discards other values.";

/** Cells read at once while counting the values a merge would cover. */
const MERGE_SCAN_CELLS = 65_536;
/** Values the warning lists; it counts the rest. */
const LISTED_VALUES = 5;
/** Characters of a listed value before it is cut with an ellipsis. */
const LISTED_TEXT_LENGTH = 24;

/** A merge's inclusive bounds, in rows and columns of the active sheet. */
interface MergeBounds {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/**
 * Merge the selected range, keeping only its upper-left value. With `warn`,
 * as Excel's own Merge does, a range in which more than one cell holds a
 * value is merged only once `warn` resolves true for Excel's warning that only
 * the upper-left value stays, and only if the selection is still that range.
 * The warning also names the values that would be discarded and their cells,
 * the first few and a count of the rest. Without `warn`, as Excel's
 * `Range.Merge` with `DisplayAlerts = False`, it merges at once.
 */
export function mergeSelection(
  deps: StyleActionsDeps,
  center: boolean,
  warn?: (message: string) => Promise<boolean>,
): void {
  const merge = merge_bounds(deps);
  if (merge === null) return;
  if (!warn) {
    commit_merge(deps, merge, center);
    return;
  }

  const values = merge_values(deps, merge);
  if (values.held < 2) {
    commit_merge(deps, merge, center);
    return;
  }

  void warn(merge_warning(values)).then((ok) => {
    // The selection or the sheet may have changed while the warning was open.
    const now = merge_bounds(deps);
    if (
      ok &&
      now !== null &&
      now.r0 === merge.r0 &&
      now.c0 === merge.c0 &&
      now.r1 === merge.r1 &&
      now.c1 === merge.c1
    ) {
      commit_merge(deps, merge, center);
    }
  });
}

/** The selected range as a merge, or null when it cannot merge. */
function merge_bounds(deps: StyleActionsDeps): MergeBounds | null {
  if (deps.readOnly()) return null;
  const active_sheet = deps.activeSheet();
  if (deps.loadable?.hasView(active_sheet)) return null;

  const sel = deps.selection().toSelection(active_sheet);
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

/** What the cells of a merge hold. */
interface MergeValues {
  /** Cells that hold a value, the upper-left one included. */
  held: number;
  /** The first values the merge would discard, as `B3: 'South'`, in reading order. */
  listed: string[];
  /** All the values the merge would discard. */
  discarded: number;
}

/**
 * Read the values of `merge`. The listed values are formatted as their cells
 * show them; the rest are only counted.
 */
function merge_values(deps: StyleActionsDeps, merge: MergeBounds): MergeValues {
  const sheet_id = deps.activeSheet();
  const columns = deps.sheet().columns;
  const cols = Array.from({ length: merge.c1 - merge.c0 + 1 }, (_, index) => merge.c0 + index);
  const band = Math.max(1, Math.floor(MERGE_SCAN_CELLS / cols.length));
  const result: MergeValues = { held: 0, listed: [], discarded: 0 };
  for (let start = merge.r0; start <= merge.r1; start += band) {
    const rows = { start, end: Math.min(merge.r1 + 1, start + band) };
    const {
      values,
      styleIds: style_ids,
      styles,
    } = deps.store.getVisibleWindow(sheet_id, rows, cols);
    for (let index = 0; index < values.length; index++) {
      const value = values[index];
      if (value === null || value === undefined || value === "") continue;
      result.held += 1;
      const row = start + Math.floor(index / cols.length);
      const col = cols[index % cols.length]!;
      if (row === merge.r0 && col === merge.c0) continue;

      result.discarded += 1;
      if (result.listed.length === LISTED_VALUES) continue;
      const format = styles[style_ids[index]!]?.numberFormat ?? columns[col]?.numberFormat;
      const text = cellDisplayText(value, format);
      const shown =
        text.length > LISTED_TEXT_LENGTH ? `${text.slice(0, LISTED_TEXT_LENGTH - 1)}…` : text;
      const reference = `${colToA1(col)}${deps.toDataRow(row) + 1}`;
      result.listed.push(`${reference}: ${typeof value === "string" ? `'${shown}'` : shown}`);
    }
  }
  return result;
}

/** Excel's warning, then the values the merge would discard and where they are. */
function merge_warning({ listed, discarded }: MergeValues): string {
  const more = discarded - listed.length;
  const values = more > 0 ? `${listed.join(", ")} and ${more} more` : listed.join(", ");
  return `${MERGE_WARNING} ${discarded === 1 ? "This value" : "These values"} will be discarded: ${values}.`;
}

function commit_merge(deps: StyleActionsDeps, merge: MergeBounds, center: boolean): void {
  const active_sheet = deps.activeSheet();
  const sheet = deps.sheet();
  const range = {
    sheet: active_sheet,
    start: { row: merge.r0, col: merge.c0 },
    end: { row: merge.r1, col: merge.c1 },
  };
  const engine = storeEngine(deps.store);
  // Per-cell operations preserve policy issue indices and partial spill rejection.
  const scalar_writes =
    !engine ||
    Boolean(
      sheet.validationRules?.length ||
      sheet.protectedRanges?.length ||
      engine.hasSpillChildren(range),
    );
  const cells: SnapshotCell[] = [];
  const patches: DocumentOp[] = [{ op: "addMerge", sheet: active_sheet, merge }];
  for (let row = merge.r0; row <= merge.r1; row++) {
    for (let col = merge.c0; col <= merge.c1; col++) {
      if (row === merge.r0 && col === merge.c0) continue;
      const value: CellValue = { kind: "literal", value: null };
      if (scalar_writes) {
        patches.push({
          op: "set",
          addr: { sheet: active_sheet, row: deps.toDataRow(row), col },
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
        sheet: active_sheet,
        start: { row: merge.r0, col: merge.c0 },
        end: { row: merge.r0, col: merge.c0 },
      },
      style: { align: "center" },
    });

  deps.commit(patches);
}
