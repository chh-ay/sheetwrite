/**
 * Excel's AutoComplete for the cell editor. It loads with the first edit
 * that types, so the first load carries none of it.
 * https://support.microsoft.com/en-us/office/turn-automatic-completion-of-cell-entries-on-or-off-0f4aa749-b927-4ff3-a8e0-28d6e2e4d4b4
 */

import { parseCellLiteralInput, parseCurrencyInput } from "./cell-input.js";
import type { StoreDataEngine } from "./store/data-engine.js";
import type { CellScalar } from "./types/cell.js";
import type { SheetId } from "./types/coordinates.js";

/** What AutoComplete reads of the sheet being edited, in view rows. */
export interface CompletionSheet {
  readonly engine: StoreDataEngine;
  readonly sheet: SheetId;
  /** Whether a sort or filter view maps view rows to scattered data rows. */
  readonly sorted: boolean;
  readonly rowCount: number;
  toDataRow(viewRow: number): number;
  /** Whether the cell at (`viewRow`, `col`) holds a value. */
  filled(viewRow: number, col: number): boolean;
  /** Where Ctrl+Arrow lands from (`viewRow`, `col`) going `dRow` rows. */
  dataEdge(viewRow: number, col: number, dRow: number, dCol: number): number | null;
}

/** `text` with the characters that mean something in a regular expression escaped. */
function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");
}

/**
 * The completions of one edit: the distinct text entries `read` returns,
 * completed by prefix, ignoring letter case. `read` runs on the first lookup
 * only. Each lookup tests only the entries the previous, shorter prefix
 * matched, so typing on narrows the scan.
 */
class ColumnCompletions {
  private readonly read: () => readonly CellScalar[];
  private entries: string[] | null = null;
  /** The entries the last prefix matched, and that prefix in lower case. */
  private matched: string[] | null = null;
  private matchedPrefix = "";

  constructor(read: () => readonly CellScalar[]) {
    this.read = read;
  }

  /**
   * The one entry that `typed` begins and that is longer than it, or null
   * when no entry or more than one does. Entries that differ only in letter
   * case count as one, the first seen. Non-text values are never entries.
   */
  complete(typed: string): string | null {
    if (typed === "") return null;
    const prefix = typed.toLowerCase();
    const pool =
      this.matched !== null && prefix.startsWith(this.matchedPrefix) ? this.matched : this.load();
    const begins = new RegExp(`^${escapeRegExp(typed)}`, "iu");
    const matched = pool.filter((entry) => begins.test(entry));
    this.matched = matched;
    this.matchedPrefix = prefix;

    const first = matched[0];
    if (first === undefined) return null;
    const key = first.toLowerCase();
    for (let index = 1; index < matched.length; index++) {
      if (matched[index]!.toLowerCase() !== key) return null;
    }
    return key.length > prefix.length ? first : null;
  }

  private load(): string[] {
    if (this.entries !== null) return this.entries;
    const entries: string[] = [];
    for (const value of this.read()) {
      if (typeof value === "string" && value !== "") entries.push(value);
    }
    this.entries = entries;
    return entries;
  }
}

/** The last filled view row of the block next to `row` in `col`, going `direction`; `row` when none. */
function blockEdge(sheet: CompletionSheet, row: number, col: number, direction: 1 | -1): number {
  const next = row + direction;
  const inside = (viewRow: number): boolean => viewRow >= 0 && viewRow < sheet.rowCount;
  if (!inside(next) || !sheet.filled(next, col)) return row;
  const after = next + direction;
  if (!inside(after) || !sheet.filled(after, col)) return next;
  return sheet.dataEdge(next, col, direction, 0) ?? next;
}

/**
 * Excel's AutoComplete for an edit of view row `row` in `col`: the distinct
 * text entries of the column's filled cells directly above and below it, up
 * to the first empty cell each way, read from the engine on the first typed
 * character. Typed numbers, dates, currency and TRUE or FALSE are not
 * completed, whatever the column's type, and neither are sheets whose data
 * is still loading.
 */
export function columnCompletions(
  sheet: CompletionSheet,
  row: number,
  col: number,
): (typed: string) => string | null {
  const { engine } = sheet;
  const completions = new ColumnCompletions(() => {
    if (engine.queryCapability(sheet.sheet).status === "incomplete") return [];
    const top = blockEdge(sheet, row, col, -1);
    const bottom = blockEdge(sheet, row, col, 1);
    const values: CellScalar[] = [];
    for (const [start, end] of [
      [top, row],
      [row + 1, bottom + 1],
    ] as const) {
      if (start >= end) continue;
      let read: CellScalar[];
      if (sheet.sorted) {
        // A sort or filter view scatters the rows; read just those data rows.
        const rows = new Uint32Array(end - start);
        let low = Infinity;
        let high = -1;
        for (let index = 0; index < rows.length; index++) {
          const dataRow = sheet.toDataRow(start + index);
          rows[index] = dataRow;
          low = Math.min(low, dataRow);
          high = Math.max(high, dataRow);
        }
        read = engine.distinctValues(sheet.sheet, col, 0, { start: low, end: high + 1 }, rows);
      } else {
        read = engine.distinctValues(sheet.sheet, col, 0, { start, end });
      }
      for (const value of read) values.push(value);
    }
    return values;
  });
  return (typed) =>
    typeof parseCellLiteralInput(typed, "date") === "string" && parseCurrencyInput(typed) === null
      ? completions.complete(typed)
      : null;
}
