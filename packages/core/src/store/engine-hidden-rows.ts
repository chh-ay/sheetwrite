import type { SheetId } from "../types/coordinates.js";
import type { RowGroup, Workbook } from "../types/document.js";
import type { RecomputingCellStore } from "./wasm-contract.js";

const EMPTY_RUNS = new Uint32Array(0);
const NOTHING_HIDDEN: SentRuns = { manual: EMPTY_RUNS, filtered: EMPTY_RUNS };

interface SentRuns {
  readonly manual: Uint32Array;
  readonly filtered: Uint32Array;
}

/**
 * Sends the hidden rows of each sheet to the engine, where SUBTOTAL and
 * AGGREGATE skip them. The engine keeps two kinds apart, as Excel does: rows
 * hidden by hand or by a collapsed row group, and rows that a filter hides.
 * Both travel as packed inclusive `[first, last]` runs. A view change only
 * queues its sheet; {@link flush} sends each queued sheet once per
 * transaction, and only when its runs changed, so hiding many rows costs one
 * engine call, not one per row.
 */
export class EngineHiddenRows {
  private readonly filtered_by_sheet = new Map<SheetId, Uint32Array>();
  private readonly sent_by_sheet = new Map<SheetId, SentRuns>();
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
   * filter is active.
   */
  viewChanged(sheet: SheetId, filterSurvivors: Uint32Array | null, rowCount: number): void {
    if (filterSurvivors)
      this.filtered_by_sheet.set(sheet, missing_row_runs(filterSurvivors, rowCount));
    else this.filtered_by_sheet.delete(sheet);

    this.pending.add(sheet);
  }

  /** Send the queued sheets whose runs differ from what the engine holds. */
  flush(): void {
    if (this.pending.size === 0) return;

    for (const sheet of this.pending) {
      const meta = this.workbook.sheets.find((candidate) => candidate.id === sheet);
      const handle = this.handles.get(sheet);
      if (!meta || handle === undefined) continue;

      const next: SentRuns = {
        manual: manual_row_runs(meta.hiddenRows, meta.rowGroups),
        filtered: this.filtered_by_sheet.get(sheet) ?? EMPTY_RUNS,
      };
      const sent = this.sent_by_sheet.get(sheet) ?? NOTHING_HIDDEN;
      if (same_runs(sent.manual, next.manual) && same_runs(sent.filtered, next.filtered)) continue;

      if (!this.wasm.setHiddenRows(handle, next.manual, next.filtered)) {
        throw new RangeError(`invalid hidden rows for sheet: ${sheet}`);
      }
      if (next.manual.length === 0 && next.filtered.length === 0) this.sent_by_sheet.delete(sheet);
      else this.sent_by_sheet.set(sheet, next);
    }

    this.pending.clear();
  }

  removeSheet(sheet: SheetId): void {
    this.filtered_by_sheet.delete(sheet);
    this.sent_by_sheet.delete(sheet);
    this.pending.delete(sheet);
  }

  dispose(): void {
    this.filtered_by_sheet.clear();
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

/** Runs of the rows in `[0, row_count)` that the ascending `present` rows leave out. */
function missing_row_runs(present: Uint32Array, row_count: number): Uint32Array {
  const runs: number[] = [];
  let next = 0;
  for (const row of present) {
    if (row > next) runs.push(next, row - 1);
    next = row + 1;
  }
  if (next < row_count) runs.push(next, row_count - 1);

  return runs.length === 0 ? EMPTY_RUNS : Uint32Array.from(runs);
}

function same_runs(left: Uint32Array, right: Uint32Array): boolean {
  if (left.length !== right.length) return false;

  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}
