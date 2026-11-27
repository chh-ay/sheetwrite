import type { SheetId } from "../types/coordinates.js";
import type { RowGroup, Workbook } from "../types/document.js";
import type { RecomputingCellStore } from "./wasm-contract.js";

const EMPTY_RUNS = new Uint32Array(0);
const NOTHING_HIDDEN: SentRows = { manual: EMPTY_RUNS, kept: null };

interface SentRows {
  /** Rows hidden by hand or by a collapsed group, as packed runs. */
  readonly manual: Uint32Array;
  /** The rows the filters keep, or `null` when no filter is on. */
  readonly kept: Uint32Array | null;
}

/**
 * Sends the hidden rows of each sheet to the engine, where SUBTOTAL and
 * AGGREGATE skip them. The engine keeps two kinds apart, as Excel does: rows
 * hidden by hand or by a collapsed row group, which travel as packed
 * inclusive `[first, last]` runs, and rows that a filter hides, which travel
 * as the rows the filter keeps: the view has them already, and the engine
 * lists the others. A view change only queues its sheet; {@link flush} sends
 * each queued sheet once per transaction, and only when its rows may have
 * changed, so hiding many rows costs one engine call, not one per row.
 *
 * Most workbooks have no formula that reads hidden rows, and a filter would
 * still send its rows on every change. {@link flushWhenRead} keeps them
 * queued until the engine holds a formula that may read them, then sends
 * the latest rows.
 */
export class EngineHiddenRows {
  private readonly kept_by_sheet = new Map<SheetId, Uint32Array>();
  private readonly sent_by_sheet = new Map<SheetId, SentRows>();
  private readonly pending = new Set<SheetId>();

  constructor(
    private wasm: RecomputingCellStore,
    private readonly workbook: Workbook,
    private readonly handles: ReadonlyMap<SheetId, number>,
  ) {}

  replaceEngine(wasm: RecomputingCellStore): void {
    this.wasm = wasm;
  }

  /** Queue a sheet whose hidden rows or row groups may have changed. */
  queue(sheet: SheetId): void {
    this.pending.add(sheet);
  }

  hasQueued(): boolean {
    return this.pending.size !== 0;
  }

  /**
   * Queue a sheet after its view was computed again. `filterSurvivors` holds
   * the ascending data rows that the active filters keep, or `null` when no
   * filter is active; it is kept, not copied, so it must not change later.
   */
  viewChanged(sheet: SheetId, filterSurvivors: Uint32Array | null): void {
    if (filterSurvivors) this.kept_by_sheet.set(sheet, filterSurvivors);
    else this.kept_by_sheet.delete(sheet);

    this.pending.add(sheet);
  }

  /**
   * Send the queued sheets whose rows may differ from what the engine holds.
   * Kept rows compare by identity: a view computed again sends its new rows,
   * and the engine recalculates only when the hidden rows changed.
   */
  flush(): void {
    if (this.pending.size === 0) return;

    for (const sheet of this.pending) {
      const meta = this.workbook.sheets.find((candidate) => candidate.id === sheet);
      const handle = this.handles.get(sheet);
      if (!meta || handle === undefined) continue;

      const next: SentRows = {
        manual: manual_row_runs(meta.hiddenRows, meta.rowGroups),
        kept: this.kept_by_sheet.get(sheet) ?? null,
      };
      const sent = this.sent_by_sheet.get(sheet) ?? NOTHING_HIDDEN;
      if (same_runs(sent.manual, next.manual) && sent.kept === next.kept) continue;

      if (!this.wasm.setRowVisibility(handle, next.manual, next.kept ?? undefined)) {
        throw new RangeError(`invalid hidden rows for sheet: ${sheet}`);
      }
      if (next.manual.length === 0 && next.kept === null) this.sent_by_sheet.delete(sheet);
      else this.sent_by_sheet.set(sheet, next);
    }

    this.pending.clear();
  }

  /**
   * {@link flush} once the engine holds a formula that may read hidden
   * rows. Until then the queued sheets wait, except the ones that would
   * send nothing: they hide no row and the engine holds none for them.
   */
  flushWhenRead(): void {
    if (this.wasm.readsRowVisibility()) {
      this.flush();
      return;
    }

    for (const sheet of this.pending) {
      if (this.kept_by_sheet.has(sheet) || this.sent_by_sheet.has(sheet)) continue;

      const meta = this.workbook.sheets.find((candidate) => candidate.id === sheet);
      if (
        meta &&
        ((meta.hiddenRows?.size ?? 0) > 0 || meta.rowGroups?.some((group) => group.collapsed))
      ) {
        continue;
      }

      this.pending.delete(sheet);
    }
  }

  removeSheet(sheet: SheetId): void {
    this.kept_by_sheet.delete(sheet);
    this.sent_by_sheet.delete(sheet);
    this.pending.delete(sheet);
  }

  dispose(): void {
    this.kept_by_sheet.clear();
    this.sent_by_sheet.clear();
    this.pending.clear();
  }
}

/**
 * Runs of the rows hidden by hand or by a collapsed group. Groups count as
 * one interval each, so a collapsed group costs nothing per row.
 */
function manual_row_runs(
  hidden_rows: ReadonlySet<number> | undefined,
  groups: readonly RowGroup[] | undefined,
): Uint32Array {
  const intervals: Array<readonly [number, number]> = [];
  for (const row of hidden_rows ?? []) intervals.push([row, row]);
  for (const group of groups ?? []) {
    if (group.collapsed) intervals.push([group.start, group.end]);
  }
  if (intervals.length === 0) return EMPTY_RUNS;

  intervals.sort((left, right) => left[0] - right[0]);
  const runs: number[] = [];
  let [start, end] = intervals[0] ?? [0, 0];
  for (const [next_start, next_end] of intervals) {
    if (next_start <= end + 1) {
      end = Math.max(end, next_end);
      continue;
    }

    runs.push(start, end);
    start = next_start;
    end = next_end;
  }
  runs.push(start, end);

  return Uint32Array.from(runs);
}

function same_runs(left: Uint32Array, right: Uint32Array): boolean {
  if (left.length !== right.length) return false;

  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}
