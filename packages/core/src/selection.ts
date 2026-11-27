import type { CellAddress, Range, Selection, SheetId } from "./types/coordinates.js";

/**
 * The cell that cell-level commands (formula bar, link, note, pivot fields)
 * act on: Excel's active cell. That is the selection's `active` cell when it
 * has one, else the selected cell, or the top-left cell of a range. With
 * several ranges it is the top-left cell of the last one. Whole rows and
 * columns without an `active` cell give null.
 */
export function selectionCell(selection: Selection | null): CellAddress | null {
  if (selection === null) return null;

  switch (selection.kind) {
    case "cell":
      return selection.addr;
    case "range":
      return selection.active ?? range_top_left(selection.range);
    case "multi": {
      if (selection.active) return selection.active;
      const last = selection.ranges.at(-1);
      return last === undefined ? null : range_top_left(last);
    }
    case "row":
    case "column":
      return selection.active ?? null;
  }
}

function range_top_left(range: Range): CellAddress {
  return {
    sheet: range.sheet,
    row: Math.min(range.start.row, range.end.row),
    col: Math.min(range.start.col, range.end.col),
  };
}

/** A cell by zero-based row and column, on no particular sheet. */
export interface CellRef {
  row: number;
  col: number;
}

export interface SelRect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

type RegionType = "range" | "row" | "column";

interface Region {
  rect: SelRect;
  type: RegionType;
}

function norm(a: CellRef, b: CellRef): SelRect {
  return {
    r0: Math.min(a.row, b.row),
    c0: Math.min(a.col, b.col),
    r1: Math.max(a.row, b.row),
    c1: Math.max(a.col, b.col),
  };
}

/**
 * Backend-agnostic selection state: a stack of rectangular regions (cells, full
 * rows, full columns) plus the live anchor/focus that keyboard extension drives.
 * The overlay painter reads `forEachRect` to draw the Layer-2 selection; input
 * handling reads `focusCell` to navigate and `contains` to test a cell.
 */
export class SelectionModel {
  private regions: Region[] = [];
  private anchor: CellRef | null = null;
  private focus: CellRef | null = null;
  private revision = 0;

  constructor(
    private rowCount: number,
    private firstCol: number,
    private lastCol: number,
  ) {}

  get version(): number {
    return this.revision;
  }

  setBounds(rowCount: number, firstCol: number, lastCol: number): void {
    this.rowCount = rowCount;
    this.firstCol = firstCol;
    this.lastCol = lastCol;
  }

  clear(): void {
    this.regions = [];
    this.anchor = null;
    this.focus = null;
    this.revision += 1;
  }

  get isEmpty(): boolean {
    return this.regions.length === 0;
  }

  /**
   * The active cell: where typing, the formula bar and cell commands act. It
   * is the cell a selection started from, so extending a selection keeps it,
   * as in Excel.
   */
  get focusCell(): CellRef | null {
    return this.anchor;
  }

  /** The moving corner of the active region, which Shift+Arrow and Shift+click extend. */
  get extentCell(): CellRef | null {
    return this.focus;
  }

  /**
   * Move the active cell to (row, col) and keep the selected cells, as Enter
   * and Tab do inside a selection in Excel. Extending afterwards starts here.
   */
  setActiveCell(row: number, col: number): void {
    this.anchor = { row, col };
    this.focus = { row, col };
    this.revision += 1;
  }

  /** Whether the complete selection is exactly this cell, without a snapshot allocation. */
  isCell(row: number, col: number): boolean {
    if (this.regions.length !== 1) return false;
    const region = this.regions[0];
    if (region?.type !== "range") return false;
    const { rect } = region;
    return rect.r0 === row && rect.r1 === row && rect.c0 === col && rect.c1 === col;
  }

  selectCell(row: number, col: number, additive = false): void {
    const region: Region = { rect: { r0: row, c0: col, r1: row, c1: col }, type: "range" };
    if (additive) this.regions.push(region);
    else this.regions = [region];
    this.anchor = { row, col };
    this.focus = { row, col };
    this.revision += 1;
  }

  /**
   * Select one rectangle and keep `active` as the active cell when it lies
   * inside, as Ctrl+A does in Excel. The moving corner is the far corner.
   */
  selectRect(rect: SelRect, active: CellRef): void {
    this.regions = [{ rect: { ...rect }, type: "range" }];
    const inside =
      rect.r0 <= active.row &&
      active.row <= rect.r1 &&
      rect.c0 <= active.col &&
      active.col <= rect.c1;
    this.anchor = inside ? { ...active } : { row: rect.r0, col: rect.c0 };
    this.focus = { row: rect.r1, col: rect.c1 };
    this.revision += 1;
  }

  /** Extend the active region from the current anchor to (row, col). */
  extendTo(row: number, col: number): void {
    if (!this.anchor) {
      this.selectCell(row, col);
      return;
    }
    this.focus = { row, col };
    const active = this.regions[this.regions.length - 1];
    if (!active) return;

    if (active.type === "column") {
      active.rect = {
        r0: 0,
        c0: Math.min(this.anchor.col, col),
        r1: this.rowCount - 1,
        c1: Math.max(this.anchor.col, col),
      };
    } else if (active.type === "row") {
      active.rect = {
        r0: Math.min(this.anchor.row, row),
        c0: this.firstCol,
        r1: Math.max(this.anchor.row, row),
        c1: this.lastCol,
      };
    } else {
      active.rect = norm(this.anchor, { row, col });
    }
    this.revision += 1;
  }

  selectColumn(col: number, additive = false, activeRow = 0): void {
    const region: Region = {
      rect: { r0: 0, c0: col, r1: Math.max(0, this.rowCount - 1), c1: col },
      type: "column",
    };
    if (additive) this.regions.push(region);
    else this.regions = [region];
    this.anchor = { row: activeRow, col };
    this.focus = { row: activeRow, col };
    this.revision += 1;
  }

  selectRow(row: number, additive = false, activeCol = this.firstCol): void {
    const region: Region = {
      rect: { r0: row, c0: this.firstCol, r1: row, c1: this.lastCol },
      type: "row",
    };
    if (additive) this.regions.push(region);
    else this.regions = [region];
    this.anchor = { row, col: activeCol };
    this.focus = { row, col: activeCol };
    this.revision += 1;
  }

  set(selection: Selection | null): void {
    if (!selection) {
      this.clear();
      return;
    }
    switch (selection.kind) {
      case "cell":
        this.selectCell(selection.addr.row, selection.addr.col);
        break;
      case "range":
        this.selectCell(selection.range.start.row, selection.range.start.col);
        this.extendTo(selection.range.end.row, selection.range.end.col);
        break;
      case "row":
        this.selectRow(selection.row);
        break;
      case "column":
        this.selectColumn(selection.col);
        break;
      case "multi":
        this.clear();
        for (const r of selection.ranges) {
          this.selectCell(r.start.row, r.start.col, true);
          this.extendTo(r.end.row, r.end.col);
        }
        break;
    }
    if (
      selection.kind !== "cell" &&
      selection.active &&
      this.contains(selection.active.row, selection.active.col)
    ) {
      this.setActiveCell(selection.active.row, selection.active.col);
    }
  }

  toSelection(sheet: SheetId): Selection | null {
    const region = this.regions.at(-1);
    if (region === undefined) return null;
    const to_range = (rect: SelRect): Range => ({
      sheet,
      start: { row: rect.r0, col: rect.c0 },
      end: { row: rect.r1, col: rect.c1 },
    });
    const { rect } = region;
    // The active cell is reported only where it differs from the cell a reader would assume.
    const active = (row: number, col: number): { active?: CellAddress } => {
      const cell = this.anchor;
      return cell === null || (cell.row === row && cell.col === col)
        ? {}
        : { active: { sheet, row: cell.row, col: cell.col } };
    };
    if (this.regions.length > 1) {
      return {
        kind: "multi",
        ranges: this.regions.map((r) => to_range(r.rect)),
        ...active(rect.r0, rect.c0),
      };
    }
    if (region.type === "column" && rect.c0 === rect.c1)
      return { kind: "column", sheet, col: rect.c0, ...active(0, rect.c0) };
    if (region.type === "row" && rect.r0 === rect.r1)
      return { kind: "row", sheet, row: rect.r0, ...active(rect.r0, this.firstCol) };
    if (rect.r0 === rect.r1 && rect.c0 === rect.c1) {
      return { kind: "cell", addr: { sheet, row: rect.r0, col: rect.c0 } };
    }
    return { kind: "range", range: to_range(rect), ...active(rect.r0, rect.c0) };
  }

  forEachRect(cb: (rect: SelRect) => void): void {
    for (const region of this.regions) cb(region.rect);
  }

  contains(row: number, col: number): boolean {
    for (const { rect } of this.regions) {
      if (row >= rect.r0 && row <= rect.r1 && col >= rect.c0 && col <= rect.c1) return true;
    }
    return false;
  }
}
