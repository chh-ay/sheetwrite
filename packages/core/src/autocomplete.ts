/**
 * Excel's AutoComplete for the cell editor, and its Pick From Drop-down List
 * (Alt+Down), which lists the same entries. It loads with the first edit that
 * types or the first list, so the first load carries none of it.
 * https://support.microsoft.com/en-us/office/turn-automatic-completion-of-cell-entries-on-or-off-0f4aa749-b927-4ff3-a8e0-28d6e2e4d4b4
 */

import { parseCellLiteralInput, parseCurrencyInput } from "./cell-input.js";
import type { SheetwriteStore } from "./store.js";
import type { StoreDataEngine } from "./store/data-engine.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar } from "./types/cell.js";
import type { SheetId } from "./types/coordinates.js";
import type { Store } from "./types/store.js";

export { PickList } from "./pick-list.js";

/**
 * The most rows read each way from the edited cell, so one edit's read stays
 * bounded however long the column's block of entries is.
 */
const AUTOCOMPLETE_ROWS = 100_000;

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

/**
 * `text` with the characters that mean something in a regular expression
 * escaped. Only these: the `u` flag rejects needless escapes such as `\-`.
 */
function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
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
 * The distinct values of the column's filled cells directly above and below
 * view row `row` in `col`, up to the first empty cell and at most
 * {@link AUTOCOMPLETE_ROWS} rows each way: Excel's AutoComplete entries.
 * Nothing while the sheet's data is still loading.
 */
function columnValues(sheet: CompletionSheet, row: number, col: number): CellScalar[] {
  const { engine } = sheet;
  if (engine.queryCapability(sheet.sheet).status === "incomplete") return [];
  const top = Math.max(blockEdge(sheet, row, col, -1), row - AUTOCOMPLETE_ROWS);
  const bottom = Math.min(blockEdge(sheet, row, col, 1), row + AUTOCOMPLETE_ROWS);
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
}

/**
 * Excel's AutoComplete for an edit of view row `row` in `col`, from the
 * entries {@link columnValues} reads on the first typed character. Typed
 * numbers, dates, currency and TRUE or FALSE are not completed, whatever the
 * column's type.
 */
export function columnCompletions(
  sheet: CompletionSheet,
  row: number,
  col: number,
): (typed: string) => string | null {
  const completions = new ColumnCompletions(() => columnValues(sheet, row, col));
  return (typed) =>
    typeof parseCellLiteralInput(typed, "date") === "string" && parseCurrencyInput(typed) === null
      ? completions.complete(typed)
      : null;
}

/** What AutoComplete reads of the grid an edit is in. */
export interface CompletionHost {
  readonly store: Store;
  readonly loadable: SheetwriteStore | null;
  activeSheet(): SheetId;
  rowCount(): number;
  toDataRow(viewRow: number): number;
  dataEdge(viewRow: number, col: number, dRow: number, dCol: number): number | null;
}

/** What AutoComplete reads of the active sheet of `host`. */
function completionSheet(host: CompletionHost, engine: StoreDataEngine): CompletionSheet {
  const sheet = host.activeSheet();
  return {
    engine,
    sheet,
    sorted: host.loadable?.hasView(sheet) ?? false,
    rowCount: host.rowCount(),
    toDataRow: (viewRow) => host.toDataRow(viewRow),
    filled: (viewRow, column) => {
      const value = host.store.getCell({
        sheet,
        row: host.toDataRow(viewRow),
        col: column,
      }).resolved;
      return value !== null && value !== "";
    },
    dataEdge: (viewRow, column, dRow, dCol) => host.dataEdge(viewRow, column, dRow, dCol),
  };
}

/**
 * The entries of Excel's Pick From Drop-down List for view row `row` in
 * `col`: AutoComplete's text entries, one per spelling that differs in more
 * than letter case, sorted A to Z ignoring case. Empty for a store without
 * an engine.
 */
export function pickListEntries(host: CompletionHost, row: number, col: number): string[] {
  const engine = storeEngine(host.store);
  if (engine === null) return [];
  const entries = new Map<string, string>();
  for (const value of columnValues(completionSheet(host, engine), row, col)) {
    if (typeof value !== "string" || value === "") continue;
    const key = value.toLowerCase();
    if (!entries.has(key)) entries.set(key, value);
  }
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return [...entries.values()].sort(collator.compare);
}

/**
 * The cell editor's AutoComplete for an edit of view row `row` in `col`: it
 * completes the editor's text in place, with the added text selected after
 * the caret, and returns the entry it shows, or null. It completes only
 * while the caret is at the end of the text, and never a formula. A store
 * without an engine gets no completion.
 */
export function editCompletion(
  host: CompletionHost,
  row: number,
  col: number,
): (field: HTMLTextAreaElement) => string | null {
  const engine = storeEngine(host.store);
  if (engine === null) return () => null;
  const complete = columnCompletions(completionSheet(host, engine), row, col);
  return (field) => {
    const typed = field.value;
    if (
      typed.startsWith("=") ||
      field.selectionStart !== typed.length ||
      field.selectionEnd !== typed.length
    ) {
      return null;
    }
    const entry = complete(typed);
    if (entry === null || entry.length <= typed.length) return null;
    field.value = typed + entry.slice(typed.length);
    field.setSelectionRange(typed.length, field.value.length);
    return entry;
  };
}
