import type { SelectionModel, SelRect } from "./selection.js";
import type { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import { mergesOverlap } from "./store/ranges.js";
import { selectionBorderPatches } from "./style-borders.js";
import type { CellStyle, CellValue } from "./types/cell.js";
import type { CellAddress, SheetId } from "./types/coordinates.js";
import type { DocumentOp, Sheet, SnapshotCell } from "./types/document.js";
import type { BorderPreset } from "./types/grid.js";
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

  setBorders(preset: BorderPreset): void {
    const selection = this.deps.selection();
    if (this.deps.readOnly() || selection.isEmpty) return;
    if (preset === "none" || preset === "all") {
      this.applyStyle({
        border:
          preset === "none"
            ? undefined
            : { all: { color: this.deps.theme().fg, width: 1, style: "solid" } },
      });

      return;
    }

    const rects: SelRect[] = [];
    selection.forEachRect((rect) => rects.push(rect));

    this.deps.commit(selectionBorderPatches(this.deps, rects, preset));
  }

  clearAll(): void {
    const selection = this.deps.selection();
    if (this.deps.readOnly() || selection.isEmpty) return;
    const patches: DocumentOp[] = [];
    selection.forEachRect((rect) => {
      let start = this.deps.toDataRow(rect.r0);
      let previous = start;
      for (let row = rect.r0 + 1; row <= rect.r1 + 1; row++) {
        const next = row <= rect.r1 ? this.deps.toDataRow(row) : -1;
        if (row <= rect.r1 && next === previous + 1) {
          previous = next;
          continue;
        }
        patches.push({
          op: "clearRange",
          range: {
            sheet: this.deps.activeSheet(),
            start: { row: start, col: rect.c0 },
            end: { row: previous, col: rect.c1 },
          },
          contents: true,
          style: true,
        });
        start = next;
        previous = next;
      }
    });
    this.deps.commit(patches);
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
    const active_sheet = this.deps.activeSheet();
    const rects: SelRect[] = [];
    const seen = new Set<number>();
    selection.forEachRect((r) => rects.push(r));
    const intersects_merge = this.deps
      .merges()
      .some((merge) => rects.some((rect) => mergesOverlap(rect, merge)));

    const patches: DocumentOp[] = [];
    if (!intersects_merge) {
      for (const rect of rects) {
        let run_start = this.deps.toDataRow(rect.r0);
        let previous = run_start;
        for (let view_row = rect.r0 + 1; view_row <= rect.r1 + 1; view_row++) {
          const data_row = view_row <= rect.r1 ? this.deps.toDataRow(view_row) : -1;
          if (view_row <= rect.r1 && Math.abs(data_row - previous) === 1) {
            previous = data_row;
            continue;
          }

          patches.push({
            op: "setRangeStyle",
            range: {
              sheet: active_sheet,
              start: { row: run_start, col: rect.c0 },
              end: { row: previous, col: rect.c1 },
            },
            style: patch,
          });

          run_start = data_row;
          previous = data_row;
        }
      }

      this.deps.commit(patches);
      return;
    }

    const anchors: CellAddress[] = [];
    for (const rect of rects) {
      for (let r = rect.r0; r <= rect.r1; r++) {
        for (let c = rect.c0; c <= rect.c1; c++) {
          const cell_ref = this.deps.anchorCell(r, c);
          const key = cell_ref.row * sheet.columns.length + cell_ref.col;
          if (seen.has(key)) continue;
          seen.add(key);

          const addr = {
            sheet: active_sheet,
            row: this.deps.toDataRow(cell_ref.row),
            col: cell_ref.col,
          };

          anchors.push(addr);
        }
      }
    }

    const captured = storeEngine(this.deps.store)?.captureCells(active_sheet, anchors);

    // One `set` per cell without an engine, or with validation rules, protected
    // ranges or spill children: the mutation policy then reports each issue at its
    // own cell's operation index, and a write into a spill child can be refused alone.
    const scalar_writes =
      !captured ||
      Boolean(
        sheet.validationRules?.length ||
        sheet.protectedRanges?.length ||
        captured.some((cell) => cell.isSpillChild),
      );

    const cells: SnapshotCell[] = [];
    let end_row = 0;
    let end_col = 0;
    for (const [index, addr] of anchors.entries()) {
      const cell = captured?.[index] ?? this.deps.store.getCell(addr);
      // A store without an engine captures no cells: the formula comes from `loadable`.
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
      if (scalar_writes) patches.push({ op: "set", addr, value, style });
      else {
        cells.push({ rowOffset: addr.row, colOffset: addr.col, value, style });
        end_row = Math.max(end_row, addr.row);
        end_col = Math.max(end_col, addr.col);
      }
    }

    // setRange preserves per-cell change events; setRangeStyle reports no cell effects.
    if (cells.length > 0)
      patches.push({
        op: "setRange",
        range: {
          sheet: active_sheet,
          start: { row: 0, col: 0 },
          end: { row: end_row, col: end_col },
        },
        cells,
      });

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
