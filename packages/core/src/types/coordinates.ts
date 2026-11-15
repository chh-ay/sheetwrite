// Coordinate, range, selection, and presence contracts for @sheetwrite/core.
// No runtime values live here.

/** Stable identifier used to address a workbook sheet. */
export type SheetId = string;

/** Zero-based address of one cell on a stable sheet ID. */
export interface CellAddress {
  /** Stable ID of the sheet (not its display name). */
  sheet: SheetId;
  /** Row index, counting from 0 at the sheet's first row. */
  row: number;
  /** Column index, counting from 0 at the sheet's first column. */
  col: number;
}

/** Inclusive merged-cell rectangle in data-row/column coordinates. */
export interface MergeRange {
  /** Zero-based first row of the merged block. */
  r0: number;
  /** Zero-based first column of the merged block. */
  c0: number;
  /** Zero-based last row of the merged block, included. */
  r1: number;
  /** Zero-based last column of the merged block, included. */
  c1: number;
}

/** Inclusive rectangular cell range on a stable sheet ID. */
export interface Range {
  /** Stable ID of the sheet the range is on. */
  sheet: SheetId;
  /** Zero-based row and column of one corner cell, included in the range. */
  start: { row: number; col: number };
  /** Zero-based row and column of the opposite corner cell, also included. */
  end: { row: number; col: number };
}

/** A highlight target: a range plus an optional per-range color override. */
export interface HighlightRange extends Range {
  /** Overrides the call-level `color` / theme highlight for this range only. */
  color?: string;
}

/**
 * Ephemeral collaborator selection rendered above the grid. Presence never
 * enters document operations, snapshots, dirty state, or undo history.
 */
export interface PresenceOverlay {
  /** Stable ID of the collaborator; the label shows it when `displayName` is missing. */
  actorId: string;
  /** Name shown in the label above the collaborator's selection. */
  displayName?: string;
  /** CSS color of the collaborator's outline and label. */
  color: string;
  /** Sheet the collaborator is on; the overlay shows only while the grid shows that sheet. */
  activeSheet: SheetId;
  /** The collaborator's selected ranges; the grid draws the first 8. */
  ranges: readonly Range[];
}

/** Current cell, range, row, column, or multi-range selection. */
export type Selection =
  | {
      /** Selects one addressed cell. */
      kind: "cell";
      /** Zero-based data address of the selected cell. */
      addr: CellAddress;
    }
  | {
      /** Selects one inclusive rectangular range. */
      kind: "range";
      /** Data-space bounds of the selected rectangle. */
      range: Range;
      /** The active cell, where typing edits, when it is not the range's start cell. */
      active?: CellAddress;
    }
  | {
      /** Selects an entire data row. */
      kind: "row";
      /** Stable ID of the containing sheet. */
      sheet: SheetId;
      /** Zero-based data-row index. */
      row: number;
      /** The active cell, where typing edits, when it is not the row's first cell. */
      active?: CellAddress;
    }
  | {
      /** Selects an entire column. */
      kind: "column";
      /** Stable ID of the containing sheet. */
      sheet: SheetId;
      /** Zero-based column index. */
      col: number;
      /** The active cell, where typing edits, when it is not the column's first cell. */
      active?: CellAddress;
    }
  | {
      /** Selects multiple, potentially disjoint rectangles. */
      kind: "multi";
      /** Data-space rectangles comprising the selection. */
      ranges: Range[];
      /** The active cell, where typing edits, when it is not the last range's start cell. */
      active?: CellAddress;
    };
