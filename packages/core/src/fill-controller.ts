// Fills: what a fill of the selection writes, its commit, the value tip the
// fill handle shows while it is dragged, and the Auto Fill Options that redo a
// finished fill another way, as Excel's button does.
// https://support.microsoft.com/en-us/excel/get-started/fill-data-automatically-in-worksheet-cells

import { shiftA1Refs } from "./a1.js";
import { cellDisplayText } from "./cell-input.js";
import {
  detectFillSeries,
  type FillDateUnit,
  type FillOptions,
  type FillSeries,
} from "./fill-series.js";
import { numberFormatDateKind } from "./general-entry.js";
import type { SelRect } from "./selection.js";
import type { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar, CellStyle, CellValue } from "./types/cell.js";
import type { Range, SheetId } from "./types/coordinates.js";
import type { CommitReason, DocumentOp, Sheet, SnapshotCell } from "./types/document.js";
import type { Store } from "./types/store.js";
import type { ApplyTransactionResult } from "./types/transaction.js";
import {
  type CopiedValidation,
  copiedValidation,
  validationPastePatches,
} from "./validation-transfer.js";

/**
 * How Auto Fill Options redoes a fill: Copy Cells, Fill Series, Fill
 * Formatting Only, Fill Without Formatting, or a date step (Fill Days,
 * Fill Weekdays, Fill Months, Fill Years).
 */
export type AutoFillChoice = "copy" | "series" | "formats" | "values" | FillDateUnit;

/** The value tip beside the fill handle: its text and where it sits in the viewport. */
export interface FillTip {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface FillControllerDeps {
  store: Store;
  loadable: SheetwriteStore | null;
  activeSheet: () => SheetId;
  sheet: () => Sheet;
  toDataRow: (viewRow: number) => number;
  /**
   * The data rows view rows `first` to `last` span with the rows hidden by
   * hand between them; null under a sort or a filter between them.
   */
  rowSpan: (first: number, last: number) => { first: number; last: number } | null;
  readOnly: () => boolean;
  commit: (patches: DocumentOp[], reason: CommitReason) => ApplyTransactionResult;
  /** Undo the last local step. */
  undo: () => void;
}

/** One cell read for a fill: its content, value and format. */
interface FillCell {
  readonly value: CellValue;
  readonly resolved: CellScalar;
  readonly style: CellStyle;
  readonly formula: string | null;
  /** Whether the cell shows a date or only a time, which sets how one cell steps. */
  readonly kind: "date" | "time" | null;
}

/**
 * The source of a fill, read once: the selected rectangle and its cells, row
 * by row, and how its rows map to data rows.
 */
interface FillSource {
  readonly rect: SelRect;
  readonly cells: readonly FillCell[];
  readonly dataRow: (row: number) => number;
}

/**
 * A fill's source and target in the rows it covers: view rows, or data rows
 * when rows hidden by hand lie among them (`hand`), which Excel fills too.
 */
interface FillRows {
  readonly source: SelRect;
  readonly target: SelRect;
  readonly dataRow: (row: number) => number;
  readonly hand: boolean;
}

/** A finished fill that Auto Fill Options can still redo. */
interface FinishedFill {
  readonly sheet: SheetId;
  readonly source: SelRect;
  readonly target: SelRect;
  readonly options: FillOptions;
  readonly dates: boolean;
}

/** The part of `target` that is new: the cells beyond the source along the fill. */
function output_of(source: SelRect, target: SelRect): SelRect | null {
  const output = { ...target };
  if (target.r0 < source.r0) output.r1 = source.r0 - 1;
  else if (target.r1 > source.r1) output.r0 = source.r1 + 1;
  else if (target.c0 < source.c0) output.c1 = source.c0 - 1;
  else if (target.c1 > source.c1) output.c0 = source.c1 + 1;
  else return null;
  return output;
}

export class FillController {
  private readonly deps: FillControllerDeps;
  /** The source of the fill handle's drag, read when the drag starts. */
  private drag_source: FillSource | null = null;
  /** The drag's source in data rows, with the rows hidden by hand in it; read when needed. */
  private hand_source: FillSource | null = null;
  /**
   * The fill the dragged handle would write now: the new view cells, their
   * plan, and the plan's row for a view row.
   */
  private drag_fill: {
    readonly output: SelRect;
    readonly plan: FillPlan;
    readonly row: (viewRow: number) => number;
  } | null = null;
  private finished: FinishedFill | null = null;
  /** True while this controller commits or undoes, so its own changes keep the button. */
  private changing = false;

  constructor(deps: FillControllerDeps) {
    this.deps = deps;
  }

  /** Read the source of a fill-handle drag once, so each pointer move only plans. */
  beginDrag(source: SelRect): void {
    this.drag_source = this.read(source, this.deps.toDataRow);
    this.hand_source = null;
  }

  endDrag(): void {
    this.drag_source = null;
    this.hand_source = null;
    this.drag_fill = null;
  }

  /**
   * Plan the dragged handle's fill into `target`, for the tip and the values
   * shown in place. Returns the text the last cell will show, for the tip;
   * null when the drag adds no cells or that cell gets a formula.
   */
  drag(target: SelRect, options: FillOptions): string | null {
    const dragged = this.drag_source;
    const output = dragged ? output_of(dragged.rect, target) : null;
    if (!dragged || !output) {
      this.drag_fill = null;
      return null;
    }
    const rows = this.rows(dragged.rect, target);
    const source = rows.hand
      ? (this.hand_source ??= this.read(rows.source, rows.dataRow))
      : dragged;
    const vertical = output.c0 === source.rect.c0 && output.c1 === source.rect.c1;
    const plan = this.plan(source, vertical, options);
    this.drag_fill = { output, plan, row: rows.hand ? this.deps.toDataRow : (row) => row };
    // The far end of the fill, in its last row or column.
    const end = output_of(source.rect, rows.target) ?? output;
    const row = vertical && end.r0 < source.rect.r0 ? end.r0 : end.r1;
    const col = !vertical && end.c0 < source.rect.c0 ? end.c0 : end.c1;
    return this.shown(plan, row, col)?.text ?? null;
  }

  /** The new cells of the dragged handle's fill, whose values show in place. */
  get dragArea(): SelRect | null {
    return this.drag_fill?.output ?? null;
  }

  /**
   * What view cell (`row`, `col`) of the dragged handle's fill will show: its
   * text, and whether it sits at the right as a number does. Null for a cell
   * that gets a formula, whose value is known only once it is written.
   */
  preview(row: number, col: number): { text: string; right: boolean } | null {
    const fill = this.drag_fill;
    return fill ? this.shown(fill.plan, fill.row(row), col) : null;
  }

  /** What cell (`row`, `col`) of `plan` will show; null for a formula. */
  private shown(plan: FillPlan, row: number, col: number): { text: string; right: boolean } | null {
    const write = this.write(plan, row, col);
    if (write.value.kind !== "literal") return null;
    const value = write.value.value;
    const align = write.style.align;
    return {
      text: cellDisplayText(value, write.style.numberFormat),
      right: align === "right" || (align === undefined && typeof value === "number"),
    };
  }

  /**
   * Fill `target` from `source`. A fill-handle fill (`offerOptions`) keeps
   * what Auto Fill Options needs to redo it. Rows hidden by hand between the
   * rows fill too, as in Excel, unless `throughHidden` is false. Returns
   * whether it applied.
   */
  fill(
    source: SelRect,
    target: SelRect,
    options: FillOptions = {},
    offerOptions = false,
    throughHidden = true,
  ): boolean {
    if (this.deps.readOnly()) return false;
    const rows = this.rows(source, target, throughHidden);
    const dragged = rows.hand ? this.hand_source : this.drag_source;
    const read =
      dragged &&
      dragged.rect.r0 === rows.source.r0 &&
      dragged.rect.c0 === rows.source.c0 &&
      dragged.rect.r1 === rows.source.r1 &&
      dragged.rect.c1 === rows.source.c1
        ? dragged
        : this.read(rows.source, rows.dataRow);
    const applied = this.commit(read, rows.target, options, null);
    this.finished =
      applied && offerOptions
        ? {
            sheet: this.deps.activeSheet(),
            source,
            target,
            options,
            dates: read.cells.every((cell) => cell.kind === "date"),
          }
        : null;
    return applied;
  }

  /** The finished fill whose Auto Fill Options button shows, or null. */
  get optionsTarget(): SelRect | null {
    const finished = this.finished;
    return finished && finished.sheet === this.deps.activeSheet() ? finished.target : null;
  }

  /** The choices the finished fill offers: the date steps only for a source of dates. */
  choices(): AutoFillChoice[] {
    const base: AutoFillChoice[] = ["copy", "series", "formats", "values"];
    return this.finished?.dates ? [...base, "day", "weekday", "month", "year"] : base;
  }

  /**
   * Redo the finished fill as `choice`, as one undo step: undo it, then fill
   * again. Returns whether the new fill applied.
   */
  redo(choice: AutoFillChoice): boolean {
    const finished = this.finished;
    if (!finished || finished.sheet !== this.deps.activeSheet() || this.deps.readOnly()) {
      return false;
    }
    const options: FillOptions =
      choice === "copy"
        ? { copy: true }
        : choice === "series"
          ? { series: true }
          : choice === "formats" || choice === "values"
            ? finished.options
            : { unit: choice };
    this.changing = true;
    try {
      this.deps.undo();
      const rows = this.rows(finished.source, finished.target);
      const applied = this.commit(
        this.read(rows.source, rows.dataRow),
        rows.target,
        options,
        choice === "formats" || choice === "values" ? choice : null,
      );
      if (!applied) this.finished = null;
      return applied;
    } finally {
      this.changing = false;
    }
  }

  /** Any change but this controller's own ends the offer, as in Excel. */
  documentChanged(): void {
    if (!this.changing) this.finished = null;
  }

  /** The sheet changed or the user moved on: the button goes. */
  dismiss(): void {
    this.finished = null;
  }

  /**
   * `source` and `target` in the rows the fill covers. When rows hidden by
   * hand lie between them, Excel fills them too, and the rectangles are then
   * in data rows. Under a sort or a filter, and without `through_hidden`, the
   * view rows.
   */
  private rows(source: SelRect, target: SelRect, through_hidden = true): FillRows {
    const view = { source, target, dataRow: this.deps.toDataRow, hand: false };
    const first = Math.min(source.r0, target.r0);
    const last = Math.max(source.r1, target.r1);
    const span = through_hidden ? this.deps.rowSpan(first, last) : null;
    if (!span || span.last - span.first === last - first) return view;
    const data = (rect: SelRect): SelRect => ({
      ...rect,
      r0: this.deps.toDataRow(rect.r0),
      r1: this.deps.toDataRow(rect.r1),
    });
    return {
      source: data(source),
      target: data(target),
      dataRow: (row) => row,
      hand: true,
    };
  }

  private read(rect: SelRect, data_row: (row: number) => number): FillSource {
    const coordinates: Array<{ row: number; col: number }> = [];
    for (let row = rect.r0; row <= rect.r1; row++) {
      for (let col = rect.c0; col <= rect.c1; col++) {
        coordinates.push({ row: data_row(row), col });
      }
    }
    const columns = this.deps.sheet().columns;
    return {
      rect,
      dataRow: data_row,
      cells: this.read_cells(coordinates).map((cell, index) => ({
        ...cell,
        kind:
          columns[coordinates[index]?.col ?? -1]?.type === "date"
            ? "date"
            : numberFormatDateKind(cell.style.numberFormat),
      })),
    };
  }

  /** The cells at `coordinates` (data rows), as one engine read when the store has one. */
  private read_cells(
    coordinates: readonly { row: number; col: number }[],
  ): Array<Omit<FillCell, "kind">> {
    const sheet = this.deps.activeSheet();
    const captured = storeEngine(this.deps.store)?.captureCells(sheet, coordinates);
    // Custom stores without an engine retain their scalar read contract.
    return coordinates.map((coordinate, index) => {
      const cell = captured?.[index];
      if (cell) {
        return {
          value: cell.value,
          resolved: cell.resolved,
          style: cell.style,
          formula: cell.value.kind === "formula" ? cell.value.src : null,
        };
      }
      const addr = { sheet, ...coordinate };
      const read = this.deps.store.getCell(addr);
      const formula = this.deps.loadable?.getFormula(addr) ?? null;
      return {
        value:
          formula === null
            ? { kind: "literal", value: read.resolved }
            : { kind: "formula", src: formula },
        resolved: read.resolved,
        style: read.style,
        formula,
      };
    });
  }

  /** The series of each source column (an up or down fill) or row (a left or right fill). */
  private plan(source: FillSource, vertical: boolean, options: FillOptions): FillPlan {
    const { rect, cells } = source;
    const width = rect.c1 - rect.c0 + 1;
    const at = (row: number, col: number): FillCell => {
      const cell = cells[(row - rect.r0) * width + col - rect.c0];
      if (!cell) throw new Error("Missing captured fill source");
      return cell;
    };
    const series = new Map<number, FillSeries>();
    const [first, last] = vertical ? [rect.c0, rect.c1] : [rect.r0, rect.r1];
    const [from, to] = vertical ? [rect.r0, rect.r1] : [rect.c0, rect.c1];
    for (let line = first; line <= last; line++) {
      const line_cells = [];
      for (let along = from; along <= to; along++) {
        const cell = vertical ? at(along, line) : at(line, along);
        line_cells.push({
          value: cell.resolved,
          isFormula: cell.formula !== null,
          isDate: cell.kind === "date",
          isTime: cell.kind === "time",
        });
      }
      series.set(line, detectFillSeries(line_cells, options));
    }
    return { rect, vertical, at, series, dataRow: source.dataRow };
  }

  /**
   * What the fill writes into cell (`row`, `col`) in the plan's rows, with the
   * format of the source cell it repeats.
   */
  private write(plan: FillPlan, row: number, col: number): { value: CellValue; style: CellStyle } {
    const { rect, vertical } = plan;
    // The source cell this target repeats; series steps count along the fill axis.
    const rows = rect.r1 - rect.r0 + 1;
    const cols = rect.c1 - rect.c0 + 1;
    const source_row = rect.r0 + ((((row - rect.r0) % rows) + rows) % rows);
    const source_col = rect.c0 + ((((col - rect.c0) % cols) + cols) % cols);
    const series = plan.series.get(vertical ? source_col : source_row);
    if (!series) throw new Error(`Missing fill series for ${vertical ? "column" : "row"}`);
    const step = series.stepAt(vertical ? row - rect.r0 : col - rect.c0);
    const from_row = vertical && step.kind === "tile" ? rect.r0 + step.sourceIndex : source_row;
    const from_col = !vertical && step.kind === "tile" ? rect.c0 + step.sourceIndex : source_col;
    const cell = plan.at(from_row, from_col);
    // Fill copies the source cell's format along with its value, as in Excel.
    if (step.kind === "value")
      return { value: { kind: "literal", value: step.value }, style: cell.style };
    if (cell.formula === null) {
      return { value: { kind: "literal", value: cell.resolved }, style: cell.style };
    }
    const d_row = plan.dataRow(row) - plan.dataRow(from_row);
    return {
      value: { kind: "formula", src: shiftA1Refs(cell.formula, d_row, col - from_col) },
      style: cell.style,
    };
  }

  /**
   * Write the fill into the new cells of `target`. `keep` keeps the targets'
   * own values ("formats", Fill Formatting Only) or formats ("values", Fill
   * Without Formatting). The new cells take the source's data validation
   * rules in place of their own, except with Fill Without Formatting: Excel
   * counts a cell's validation with its formats.
   */
  private commit(
    source: FillSource,
    target: SelRect,
    options: FillOptions,
    keep: "formats" | "values" | null,
  ): boolean {
    const output = output_of(source.rect, target);
    if (!output) return false;
    const vertical = output.c0 === source.rect.c0 && output.c1 === source.rect.c1;
    const plan = this.plan(source, vertical, options);

    const sheet = this.deps.activeSheet();
    const data_rows: number[] = [];
    for (let row = output.r0; row <= output.r1; row++) data_rows.push(source.dataRow(row));
    const first_row = data_rows[0];
    if (first_row === undefined) return false;
    const start_row = data_rows.reduce((minimum, row) => Math.min(minimum, row), first_row);
    const end_row = data_rows.reduce((maximum, row) => Math.max(maximum, row), first_row);
    const width = output.c1 - output.c0 + 1;

    const existing = keep
      ? this.read_cells(
          data_rows.flatMap((row) =>
            Array.from({ length: width }, (_, index) => ({ row, col: output.c0 + index })),
          ),
        )
      : null;

    const metadata = this.deps.sheet();
    // Protection requires per-cell operations for policy issue indices. A fill
    // is not checked against validation rules, as in Excel.
    const scalar_writes = Boolean(metadata.protectedRanges?.length);
    const patches: DocumentOp[] = [];
    const cells: SnapshotCell[] = [];
    for (let r = output.r0; r <= output.r1; r++) {
      const data_row = data_rows[r - output.r0] ?? first_row;
      for (let c = output.c0; c <= output.c1; c++) {
        const write = this.write(plan, r, c);
        const own = existing?.[(r - output.r0) * width + c - output.c0];
        const value = keep === "formats" && own ? own.value : write.value;
        const style = keep === "values" && own ? own.style : write.style;
        if (scalar_writes) {
          patches.push({ op: "set", addr: { sheet, row: data_row, col: c }, value, style });
        } else {
          cells.push({ rowOffset: data_row - start_row, colOffset: c - output.c0, value, style });
        }
      }
    }

    // setRange keeps per-cell change events; setBlock reports them only on opt-in.
    const range = {
      sheet,
      start: { row: start_row, col: output.c0 },
      end: { row: end_row, col: output.c1 },
    };
    const rules =
      keep === "values" ? [] : this.validation_patches(source, output, vertical, data_rows);
    const was_changing = this.changing;
    this.changing = true;
    try {
      const outcome = this.deps.commit(
        scalar_writes ? [...patches, ...rules] : [{ op: "setRange", range, cells }, ...rules],
        "fill",
      );
      return outcome.status === "applied";
    } finally {
      this.changing = was_changing;
    }
  }

  /**
   * The rule changes of a fill, through the paste's transfer: each new cell
   * takes the validation rules of the source cell it repeats, in place of its
   * own, as Excel's fill does. A rule over the whole source along the fill
   * covers the new cells as one range. None when a sorted view splits the
   * rows, as for a paste.
   */
  private validation_patches(
    source: FillSource,
    output: SelRect,
    vertical: boolean,
    data_rows: readonly number[],
  ): DocumentOp[] {
    const sheet = this.deps.sheet();
    const rules = sheet.validationRules ?? [];
    const { rect } = source;
    const first = source.dataRow(rect.r0);
    const output_first = data_rows[0];
    if (rules.length === 0 || output_first === undefined) return [];
    for (let row = rect.r0 + 1; row <= rect.r1; row++) {
      if (source.dataRow(row) !== first + row - rect.r0) return [];
    }
    if (data_rows.some((row, index) => row !== output_first + index)) return [];
    const block: Range = {
      sheet: sheet.id,
      start: { row: first, col: rect.c0 },
      end: { row: first + rect.r1 - rect.r0, col: rect.c1 },
    };
    // Along the fill: where the source starts, its length, and the new cells.
    const [from, length, start, end] = vertical
      ? [rect.r0, rect.r1 - rect.r0 + 1, output.r0, output.r1]
      : [rect.c0, rect.c1 - rect.c0 + 1, output.c0, output.c1];
    const pieces: CopiedValidation[] = [];
    for (const piece of copiedValidation(rules, block)) {
      const [lo, hi] = vertical ? piece.rows : piece.cols;
      const place = (a: number, b: number): void => {
        const along = [a - start, b - start] as const;
        pieces.push({
          rule: piece.rule,
          rows: vertical ? along : piece.rows,
          cols: vertical ? piece.cols : along,
          at: piece.at,
        });
      };
      if (lo === 0 && hi === length - 1) {
        place(start, end);
        continue;
      }
      // One run of new cells per repeat of the source, joined where they touch.
      let run: [number, number] | null = null;
      for (let tile = start; tile <= end;) {
        const offset = (((tile - from) % length) + length) % length;
        const tile_end = Math.min(end, tile + length - 1 - offset);
        const a = tile + Math.max(lo, offset) - offset;
        const b = tile + Math.min(hi, offset + tile_end - tile) - offset;
        if (a <= b) {
          if (run && run[1] + 1 === a) run[1] = b;
          else {
            if (run) place(run[0], run[1]);
            run = [a, b];
          }
        }
        tile = tile_end + 1;
      }
      if (run) place(run[0], run[1]);
    }
    const rows = output.r1 - output.r0 + 1;
    const cols = output.c1 - output.c0 + 1;
    return validationPastePatches(
      sheet,
      pieces,
      { rows, cols },
      { row: output_first, col: output.c0, rows, cols },
    );
  }
}

/** The series of a fill and the source cells they read. */
interface FillPlan {
  readonly rect: SelRect;
  readonly vertical: boolean;
  readonly at: (row: number, col: number) => FillCell;
  readonly series: ReadonlyMap<number, FillSeries>;
  readonly dataRow: (row: number) => number;
}
