// The AutoFilter's commands: Data › Filter, Clear, and Filter by Selected
// Cell's Value. They apply when they are called; the header's dropdown is in
// `autofilter-actions.ts`, which loads on first use.

import { currentRegion } from "./sort-target.js";
import { rangeContains } from "./store/ranges.js";
import type { CellAddress, Range } from "./types/coordinates.js";
import type { DocumentOp, Sheet } from "./types/document.js";
import type { Grid } from "./types/grid.js";

/** What the commands need from the grid beyond its public methods. */
export interface AutoFilterCommandsHost {
  readonly grid: Grid;
  readonly sheet: () => Sheet;
  /** The focus cell in sheet rows, or `null` without a selection. */
  readonly focus: () => CellAddress | null;
  /** The one selected rectangle of several cells in sheet rows, as sorting reads it. */
  readonly selectedRange: () => Range | null;
  /** Commit `op` as one undo step. */
  readonly commit: (op: DocumentOp) => void;
  readonly feedback: (message: string) => void;
}

/**
 * Data › Filter (Ctrl+Shift+L): off when the sheet has an AutoFilter, else on
 * for the range Excel picks.
 */
export function toggleAutoFilter(host: AutoFilterCommandsHost): void {
  if (host.sheet().autoFilter) {
    host.grid.setAutoFilter(null);
    return;
  }
  const range = auto_filter_target(host);
  if (range) host.grid.setAutoFilter(range);
  else host.feedback("Select a cell in a range of data to filter.");
}

/** Data › Clear: remove every column filter; the buttons stay. */
export function clearFilters(host: AutoFilterCommandsHost): void {
  const sheet = host.sheet();
  if ((sheet.filters?.length ?? 0) === 0) return;
  host.commit({ op: "setSheetMeta", sheet: sheet.id, patch: { filters: [] } });
}

/** Filter the focus cell's column to its value, turning the AutoFilter on if needed. */
export function filterBySelection(host: AutoFilterCommandsHost): void {
  const focus = host.focus();
  if (!focus) return;
  const filter = { kind: "values" as const, values: [host.grid.store.getCell(focus).resolved] };
  const current = host.sheet().autoFilter?.range;
  if (current && focus.col >= current.start.col && focus.col <= current.end.col) {
    host.grid.setColumnFilter(focus.col, filter);
    return;
  }

  const range = auto_filter_target(host);
  if (!range) return;
  host.commit({
    op: "setSheetMeta",
    sheet: focus.sheet,
    patch: { autoFilter: { range }, filters: [[focus.col, filter]] },
  });
}

/**
 * The range Data › Filter turns filters on for, as Excel picks it: the table
 * at the focus cell without its totals row, else the selected range, else
 * the current region around the focus cell. `null` on an empty cell.
 */
function auto_filter_target(host: AutoFilterCommandsHost): Range | null {
  const addr = host.focus();
  if (!addr) return null;
  const table = host.sheet().tables?.find((candidate) => rangeContains(candidate.range, addr));
  if (table) {
    const { range } = table;
    const end = { row: range.end.row - (table.totalsRow ? 1 : 0), col: range.end.col };
    return { sheet: range.sheet, start: { ...range.start }, end };
  }

  const range = host.selectedRange() ?? currentRegion(host.grid.store, addr);
  return range && rangeContains(range, addr) ? range : null;
}
