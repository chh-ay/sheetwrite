import type { SelectionModel, SelRect } from "./selection.js";
import type { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import { mergeCrossesFreeze, mergesOverlap } from "./store/ranges.js";
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

    const edgeLimit = 65_536;
    const side = {
      color: this.deps.theme().fg,
      width: preset === "thickOutside" ? 2 : 1,
      style: "solid" as const,
    };
    const targets = new Map<
      string,
      { row: number; col: number; border: NonNullable<CellStyle["border"]> }
    >();
    const rects: SelRect[] = [];
    selection.forEachRect((rect) => rects.push(rect));
    const outside = preset === "outside" || preset === "thickOutside";
    const edgeCount = rects.reduce(
      (count, rect) =>
        count +
        (outside || preset === "top" || preset === "bottom"
          ? (rect.c1 - rect.c0 + 1) * (outside ? 2 : 1)
          : 0) +
        (outside || preset === "left" || preset === "right"
          ? (rect.r1 - rect.r0 + 1) * (outside ? 2 : 1)
          : 0),
      0,
    );
    const add = (row: number, col: number, edge: "top" | "bottom" | "left" | "right"): void => {
      const anchor = this.deps.anchorCell(row, col);
      const dataRow = this.deps.toDataRow(anchor.row);
      const key = `${dataRow}:${anchor.col}`;
      let target = targets.get(key);
      if (!target) {
        target = { row: dataRow, col: anchor.col, border: {} };
        targets.set(key, target);
      }
      target.border[edge] = side;
    };
    const patches: DocumentOp[] = [];
    if (edgeCount > edgeLimit) {
      // Bound style reads and allocation for huge edges; side-only borders replace existing borders.
      for (const rect of rects) {
        const edges = [
          ["top", rect.r0, rect.c0, rect.r0, rect.c1],
          ["bottom", rect.r1, rect.c0, rect.r1, rect.c1],
          ["left", rect.r0, rect.c0, rect.r1, rect.c0],
          ["right", rect.r0, rect.c1, rect.r1, rect.c1],
        ] as const;
        for (const [edge, r0, c0, r1, c1] of edges) {
          if (!outside && preset !== edge) continue;
          let strips: SelRect[] = [{ r0, c0, r1, c1 }];
          if (outside) {
            add(r0, c0, edge);
            add(r1, c1, edge);
            const horizontal = edge === "top" || edge === "bottom";
            const interior = horizontal
              ? { r0, c0: c0 + 1, r1, c1: c1 - 1 }
              : { r0: r0 + 1, c0, r1: r1 - 1, c1 };
            strips = interior.r0 <= interior.r1 && interior.c0 <= interior.c1 ? [interior] : [];
          }
          for (const merge of this.deps.merges()) {
            const remainder: SelRect[] = [];
            for (const strip of strips) {
              if (!mergesOverlap(strip, merge)) {
                remainder.push(strip);
                continue;
              }
              add(Math.max(strip.r0, merge.r0), Math.max(strip.c0, merge.c0), edge);
              if (strip.r0 === strip.r1) {
                if (strip.c0 < merge.c0) remainder.push({ ...strip, c1: merge.c0 - 1 });
                if (strip.c1 > merge.c1) remainder.push({ ...strip, c0: merge.c1 + 1 });
              } else {
                if (strip.r0 < merge.r0) remainder.push({ ...strip, r1: merge.r0 - 1 });
                if (strip.r1 > merge.r1) remainder.push({ ...strip, r0: merge.r1 + 1 });
              }
            }
            strips = remainder;
          }
          for (const strip of strips) {
            let start = this.deps.toDataRow(strip.r0);
            let previous = start;
            for (let row = strip.r0 + 1; row <= strip.r1 + 1; row++) {
              const next = row <= strip.r1 ? this.deps.toDataRow(row) : -1;
              if (row <= strip.r1 && next === previous + 1) {
                previous = next;
                continue;
              }
              patches.push({
                op: "setRangeStyle",
                range: {
                  sheet: this.deps.activeSheet(),
                  start: { row: start, col: strip.c0 },
                  end: { row: previous, col: strip.c1 },
                },
                style: { border: { [edge]: side } },
              });
              start = next;
              previous = next;
            }
          }
        }
      }
      for (const target of targets.values()) {
        patches.push({
          op: "setRangeStyle",
          range: {
            sheet: this.deps.activeSheet(),
            start: { row: target.row, col: target.col },
            end: { row: target.row, col: target.col },
          },
          style: { border: target.border },
        });
      }
      this.deps.commit(patches);
      return;
    }

    for (const rect of rects) {
      if (outside || preset === "top")
        for (let col = rect.c0; col <= rect.c1; col++) add(rect.r0, col, "top");
      if (outside || preset === "bottom")
        for (let col = rect.c0; col <= rect.c1; col++) add(rect.r1, col, "bottom");
      if (outside || preset === "left")
        for (let row = rect.r0; row <= rect.r1; row++) add(row, rect.c0, "left");
      if (outside || preset === "right")
        for (let row = rect.r0; row <= rect.r1; row++) add(row, rect.c1, "right");
    }
    const cells = [...targets.values()];
    const sheet = this.deps.activeSheet();
    const captured = storeEngine(this.deps.store)?.captureResolvedCells(sheet, cells);
    const merged = cells.map((cell, index) => ({
      ...cell,
      border: {
        ...(captured?.[index] ?? this.deps.store.getCell({ sheet, row: cell.row, col: cell.col }))
          .style.border,
        ...cell.border,
      },
    }));
    const runs = (columnWise: boolean): DocumentOp[] => {
      const sorted = [...merged].sort((a, b) =>
        columnWise ? a.col - b.col || a.row - b.row : a.row - b.row || a.col - b.col,
      );
      const result: DocumentOp[] = [];
      let previous: (typeof sorted)[number] | undefined;
      let signature = "";
      for (const cell of sorted) {
        const key = JSON.stringify(cell.border);
        const last = result[result.length - 1];
        if (
          previous &&
          key === signature &&
          last?.op === "setRangeStyle" &&
          (columnWise
            ? cell.col === previous.col && cell.row === previous.row + 1
            : cell.row === previous.row && cell.col === previous.col + 1)
        ) {
          last.range.end = { row: cell.row, col: cell.col };
        } else
          result.push({
            op: "setRangeStyle",
            range: {
              sheet,
              start: { row: cell.row, col: cell.col },
              end: { row: cell.row, col: cell.col },
            },
            style: { border: cell.border },
          });
        previous = cell;
        signature = key;
      }
      return result;
    };
    const rows = runs(false);
    const columns = runs(true);
    this.deps.commit(rows.length <= columns.length ? rows : columns);
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

  mergeSelection(center = false): void {
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
