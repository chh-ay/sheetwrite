import type { SelectionModel, SelRect } from "./selection.js";
import type { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import { mergeCrossesFreeze, mergesOverlap } from "./store/ranges.js";
import type { CellStyle, CellValue } from "./types/cell.js";
import type { CellAddress, SheetId } from "./types/coordinates.js";
import type { DocumentOp, Sheet, SnapshotCell } from "./types/document.js";
import type { Theme } from "./types/render.js";
import type { Store } from "./types/store.js";

export interface StyleActionsDeps {
  store: Store;
  loadable: SheetwriteStore | null;
  selection: () => SelectionModel;
  activeSheet: () => SheetId;
  sheet: () => Sheet;
  readOnly: () => boolean;
  theme: () => Theme;
  merges: () => SelRect[];
  anchorCell: (row: number, col: number) => { row: number; col: number };
  toDataRow: (viewRow: number) => number;
  commit: (patches: DocumentOp[]) => void;
}

/**
 * Implements selection-scoped formatting and merge commands for toolbar and
 * context-menu actions without owning the public action surface.
 */
export class StyleActions {
  private readonly deps: StyleActionsDeps;

  constructor(deps: StyleActionsDeps) {
    this.deps = deps;
  }

  toggleBorder(): void {
    const f = this.deps.selection().focusCell;
    const cell = f ? this.deps.anchorCell(f.row, f.col) : null;
    const has =
      cell !== null &&
      this.deps.store.getCell({
        sheet: this.deps.activeSheet(),
        row: this.deps.toDataRow(cell.row),
        col: cell.col,
      }).style.border !== undefined;

    this.applyStyle({
      border: has ? undefined : { all: { color: this.deps.theme().fg, width: 1 } },
    });
  }

  toggleStyle(prop: "bold" | "italic" | "underline" | "strikethrough"): void {
    const f = this.deps.selection().focusCell;
    const cell = f ? this.deps.anchorCell(f.row, f.col) : null;
    const on = cell
      ? this.deps.store.getCell({
          sheet: this.deps.activeSheet(),
          row: this.deps.toDataRow(cell.row),
          col: cell.col,
        }).style[prop]
      : false;
    this.applyStyle({ [prop]: !on });
  }

  /**
   * Preserve selected values while merging `patch` into their stored styles
   * (or clearing styles when `patch` is null).
   */
  applyStyle(patch: Partial<CellStyle> | null): void {
    const selection = this.deps.selection();
    if (this.deps.readOnly() || selection.isEmpty) return;

    const sheet = this.deps.sheet();
    const activeSheet = this.deps.activeSheet();
    const rects: SelRect[] = [];
    const seen = new Set<number>();
    selection.forEachRect((r) => rects.push(r));
    const intersectsMerge = this.deps
      .merges()
      .some((merge) => rects.some((rect) => mergesOverlap(rect, merge)));

    const patches: DocumentOp[] = [];
    if (!intersectsMerge) {
      for (const rect of rects) {
        let runStart = this.deps.toDataRow(rect.r0);
        let previous = runStart;
        for (let viewRow = rect.r0 + 1; viewRow <= rect.r1 + 1; viewRow++) {
          const dataRow = viewRow <= rect.r1 ? this.deps.toDataRow(viewRow) : -1;
          if (viewRow <= rect.r1 && Math.abs(dataRow - previous) === 1) {
            previous = dataRow;
            continue;
          }
          patches.push({
            op: "setRangeStyle",
            range: {
              sheet: activeSheet,
              start: { row: runStart, col: rect.c0 },
              end: { row: previous, col: rect.c1 },
            },
            style: patch,
          });
          runStart = dataRow;
          previous = dataRow;
        }
      }
      this.deps.commit(patches);
      return;
    }

    const anchors: CellAddress[] = [];
    for (const rect of rects) {
      for (let r = rect.r0; r <= rect.r1; r++) {
        for (let c = rect.c0; c <= rect.c1; c++) {
          const cellRef = this.deps.anchorCell(r, c);
          const key = cellRef.row * sheet.columns.length + cellRef.col;
          if (seen.has(key)) continue;
          seen.add(key);

          const addr = {
            sheet: activeSheet,
            row: this.deps.toDataRow(cellRef.row),
            col: cellRef.col,
          };
          anchors.push(addr);
        }
      }
    }

    const captured = storeEngine(this.deps.store)?.captureCells(activeSheet, anchors);
    // Per-cell operations preserve policy issue indices and partial spill rejection.
    const scalarWrites =
      !captured ||
      Boolean(
        sheet.validationRules?.length ||
        sheet.protectedRanges?.length ||
        captured.some((cell) => cell.isSpillChild),
      );
    const cells: SnapshotCell[] = [];
    let endRow = 0;
    let endCol = 0;
    for (const [index, addr] of anchors.entries()) {
      const cell = captured?.[index] ?? this.deps.store.getCell(addr);
      // Custom stores without an engine retain their scalar source read contract.
      const persisted = captured?.[index]?.value;
      const formula = captured
        ? persisted?.kind === "formula"
          ? persisted.src
          : null
        : (this.deps.loadable?.getFormula(addr) ?? null);
      const value: CellValue = formula
        ? { kind: "formula", src: formula }
        : { kind: "literal", value: cell.resolved };
      const style = patch ? { ...cell.style, ...patch } : undefined;
      if (scalarWrites) patches.push({ op: "set", addr, value, style });
      else {
        cells.push({ rowOffset: addr.row, colOffset: addr.col, value, style });
        endRow = Math.max(endRow, addr.row);
        endCol = Math.max(endCol, addr.col);
      }
    }

    // setRange preserves per-cell change events; setRangeStyle reports no cell effects.
    if (cells.length > 0)
      patches.push({
        op: "setRange",
        range: { sheet: activeSheet, start: { row: 0, col: 0 }, end: { row: endRow, col: endCol } },
        cells,
      });

    this.deps.commit(patches);
  }

  mergeSelection(): void {
    if (this.deps.readOnly()) return;
    const activeSheet = this.deps.activeSheet();
    if (this.deps.loadable?.hasView(activeSheet)) return;

    const sel = this.deps.selection().toSelection(activeSheet);
    if (sel?.kind !== "range") return;
    const { start, end } = sel.range;
    const merge = {
      r0: Math.min(start.row, end.row),
      c0: Math.min(start.col, end.col),
      r1: Math.max(start.row, end.row),
      c1: Math.max(start.col, end.col),
    };
    if (merge.r0 === merge.r1 && merge.c0 === merge.c1) return;
    const sheet = this.deps.sheet();
    if (
      mergeCrossesFreeze(sheet, merge) ||
      this.deps.merges().some((candidate) => mergesOverlap(merge, candidate))
    ) {
      return;
    }

    const range = {
      sheet: activeSheet,
      start: { row: merge.r0, col: merge.c0 },
      end: { row: merge.r1, col: merge.c1 },
    };
    const engine = storeEngine(this.deps.store);
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
            addr: { sheet: activeSheet, row: this.deps.toDataRow(row), col },
            value,
          });
        } else cells.push({ rowOffset: row - merge.r0, colOffset: col - merge.c0, value });
      }
    }

    if (cells.length > 0) patches.push({ op: "setRange", range, cells });

    this.deps.commit(patches);
  }

  unmergeSelection(): void {
    if (this.deps.readOnly()) return;
    const f = this.deps.selection().focusCell;
    const list = this.deps.merges();
    if (!f || list.length === 0) return;
    const merge = list.find(
      (candidate) =>
        f.row >= candidate.r0 &&
        f.row <= candidate.r1 &&
        f.col >= candidate.c0 &&
        f.col <= candidate.c1,
    );
    if (!merge) return;
    this.deps.commit([{ op: "removeMerge", sheet: this.deps.activeSheet(), merge }]);
  }
}
