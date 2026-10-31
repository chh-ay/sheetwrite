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
  private readonly filteredBySheet = new Map<SheetId, Uint32Array>();
  private readonly sentBySheet = new Map<SheetId, SentRuns>();
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

  /**
   * Queue a sheet after its view was computed again. `filterSurvivors` holds
   * the ascending data rows that the active filters keep, or `null` when no
   * filter is active.
   */
  viewChanged(sheet: SheetId, filterSurvivors: Uint32Array | null, rowCount: number): void {
    if (filterSurvivors) this.filteredBySheet.set(sheet, missingRowRuns(filterSurvivors, rowCount));
    else this.filteredBySheet.delete(sheet);

    this.pending.add(sheet);
  }

  /** Send the queued sheets whose runs differ from what the engine holds. */
  flush(): void {
    // Most transactions queue nothing. Creating the iterator of an empty set
    // still cost about 0.13 µs per one-cell edit in the engine memory probe.
    if (this.pending.size === 0) return;

    for (const sheet of this.pending) {
      const meta = this.workbook.sheets.find((candidate) => candidate.id === sheet);
      const handle = this.handles.get(sheet);
      if (!meta || handle === undefined) continue;

      const next: SentRuns = {
        manual: manualRowRuns(meta.hiddenRows, meta.rowGroups),
        filtered: this.filteredBySheet.get(sheet) ?? EMPTY_RUNS,
      };
      const sent = this.sentBySheet.get(sheet) ?? NOTHING_HIDDEN;
      if (sameRuns(sent.manual, next.manual) && sameRuns(sent.filtered, next.filtered)) continue;

      if (!this.wasm.setHiddenRows(handle, next.manual, next.filtered)) {
        throw new RangeError(`invalid hidden rows for sheet: ${sheet}`);
      }
      if (next.manual.length === 0 && next.filtered.length === 0) this.sentBySheet.delete(sheet);
      else this.sentBySheet.set(sheet, next);
    }

    this.pending.clear();
  }

  removeSheet(sheet: SheetId): void {
    this.filteredBySheet.delete(sheet);
    this.sentBySheet.delete(sheet);
    this.pending.delete(sheet);
  }

  dispose(): void {
    this.filteredBySheet.clear();
    this.sentBySheet.clear();
    this.pending.clear();
  }
}

/**
 * Runs of the rows hidden by hand or by a collapsed group. Groups count as
 * one interval each, so a collapsed group costs nothing per row.
 */
function manualRowRuns(
  hiddenRows: ReadonlySet<number> | undefined,
  groups: readonly RowGroup[] | undefined,
): Uint32Array {
  const intervals: Array<readonly [number, number]> = [];
  for (const row of hiddenRows ?? []) intervals.push([row, row]);
  for (const group of groups ?? []) {
    if (group.collapsed) intervals.push([group.start, group.end]);
  }
  if (intervals.length === 0) return EMPTY_RUNS;

  intervals.sort((left, right) => left[0] - right[0]);
  const runs: number[] = [];
  let [start, end] = intervals[0] ?? [0, 0];
  for (const [nextStart, nextEnd] of intervals) {
    if (nextStart <= end + 1) {
      end = Math.max(end, nextEnd);
      continue;
    }

    runs.push(start, end);
    start = nextStart;
    end = nextEnd;
  }
  runs.push(start, end);

  return Uint32Array.from(runs);
}

/** Runs of the rows in `[0, rowCount)` that the ascending `present` rows leave out. */
function missingRowRuns(present: Uint32Array, rowCount: number): Uint32Array {
  const runs: number[] = [];
  let next = 0;
  for (const row of present) {
    if (row > next) runs.push(next, row - 1);
    next = row + 1;
  }
  if (next < rowCount) runs.push(next, rowCount - 1);

  return runs.length === 0 ? EMPTY_RUNS : Uint32Array.from(runs);
}

function sameRuns(left: Uint32Array, right: Uint32Array): boolean {
  if (left.length !== right.length) return false;

  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}
