/**
 * Excel's AutoComplete for the cell editor, and its Pick From Drop-down List
 * (Alt+Down), which lists the same entries. It loads with the first edit that
 * types or the first list, so the first load carries none of it.
 * https://support.microsoft.com/en-us/office/turn-automatic-completion-of-cell-entries-on-or-off-0f4aa749-b927-4ff3-a8e0-28d6e2e4d4b4
 */

import { parseCellLiteralInput, parseCurrencyInput } from "./cell-input.js";
import type { EditCompletion } from "./editor.js";
import { EntryList } from "./pick-list.js";
import type { SheetwriteStore } from "./store.js";
import type { StoreDataEngine } from "./store/data-engine.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar } from "./types/cell.js";
import type { SheetId } from "./types/coordinates.js";
import type { Theme } from "./types/render.js";
import type { Store } from "./types/store.js";

export { PickList } from "./pick-list.js";

/**
 * The most rows read each way from the edited cell, so one edit's read stays
 * bounded however long the column's block of entries is.
 */
const AUTOCOMPLETE_ROWS = 100_000;

/**
 * The most spellings AutoComplete's list shows. With more, it shows none
 * until typing narrows them, and the scan stops counting there.
 */
const LIST_ENTRIES = 50;

/** Entries sort A to Z ignoring letter case and accents, as Excel's lists do. */
const ENTRY_ORDER = new Intl.Collator(undefined, { sensitivity: "base" });

/** What the entries of a column make of a typed text. */
export interface CompletionLookup {
  /** The entry that completes the text inline: the only one it begins, and longer than it. */
  readonly entry: string | null;
  /** The entries the text begins when two to {@link LIST_ENTRIES} spellings do, sorted; else none. */
  readonly matches: readonly string[];
}

const NO_MATCH: CompletionLookup = { entry: null, matches: [] };

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
function escape_reg_exp(text: string): string {
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
  private matched_prefix = "";

  constructor(read: () => readonly CellScalar[]) {
    this.read = read;
  }

  /**
   * The entries that `typed` begins. Entries that differ only in letter case
   * count as one spelling, the first seen. Excel completes inline only when
   * one spelling begins the text; with more, they are listed instead.
   * Non-text values are never entries.
   */
  lookup(typed: string): CompletionLookup {
    if (typed === "") return NO_MATCH;
    const prefix = typed.toLowerCase();
    const pool =
      this.matched !== null && prefix.startsWith(this.matched_prefix) ? this.matched : this.load();
    const begins = new RegExp(`^${escape_reg_exp(typed)}`, "iu");
    const matched = pool.filter((entry) => begins.test(entry));
    this.matched = matched;
    this.matched_prefix = prefix;

    const spellings = new Map<string, string>();
    for (const entry of matched) {
      const key = entry.toLowerCase();
      if (spellings.has(key)) continue;
      if (spellings.size === LIST_ENTRIES) return NO_MATCH;
      spellings.set(key, entry);
    }
    if (spellings.size > 1) {
      return { entry: null, matches: [...spellings.values()].sort(ENTRY_ORDER.compare) };
    }
    for (const [key, entry] of spellings) {
      return { entry: key.length > prefix.length ? entry : null, matches: [] };
    }
    return NO_MATCH;
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
function block_edge(sheet: CompletionSheet, row: number, col: number, direction: 1 | -1): number {
  const next = row + direction;
  const inside = (view_row: number): boolean => view_row >= 0 && view_row < sheet.rowCount;
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
function column_values(sheet: CompletionSheet, row: number, col: number): CellScalar[] {
  const { engine } = sheet;
  if (engine.queryCapability(sheet.sheet).status === "incomplete") return [];
  const top = Math.max(block_edge(sheet, row, col, -1), row - AUTOCOMPLETE_ROWS);
  const bottom = Math.min(block_edge(sheet, row, col, 1), row + AUTOCOMPLETE_ROWS);
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
        const data_row = sheet.toDataRow(start + index);
        rows[index] = data_row;
        low = Math.min(low, data_row);
        high = Math.max(high, data_row);
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
 * entries {@link column_values} reads on the first lookup. Typed numbers,
 * dates, currency and TRUE or FALSE are neither completed nor listed,
 * whatever the column's type.
 */
export function columnCompletions(
  sheet: CompletionSheet,
  row: number,
  col: number,
): (typed: string) => CompletionLookup {
  const completions = new ColumnCompletions(() => column_values(sheet, row, col));
  return (typed) =>
    typeof parseCellLiteralInput(typed, "date") === "string" && parseCurrencyInput(typed) === null
      ? completions.lookup(typed)
      : NO_MATCH;
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
function completion_sheet(host: CompletionHost, engine: StoreDataEngine): CompletionSheet {
  const sheet = host.activeSheet();
  return {
    engine,
    sheet,
    sorted: host.loadable?.hasView(sheet) ?? false,
    rowCount: host.rowCount(),
    toDataRow: (view_row) => host.toDataRow(view_row),
    filled: (view_row, column) => {
      const value = host.store.getCell({
        sheet,
        row: host.toDataRow(view_row),
        col: column,
      }).resolved;
      return value !== null && value !== "";
    },
    dataEdge: (view_row, column, d_row, d_col) => host.dataEdge(view_row, column, d_row, d_col),
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
  for (const value of column_values(completion_sheet(host, engine), row, col)) {
    if (typeof value !== "string" || value === "") continue;
    const key = value.toLowerCase();
    if (!entries.has(key)) entries.set(key, value);
  }
  return [...entries.values()].sort(ENTRY_ORDER.compare);
}

/**
 * The cell editor's AutoComplete for one edit. Typing completes the text in
 * place when one entry begins it, with the added text selected, as in Excel.
 * When several do, they are listed under the editor instead. The list is
 * extra: it takes no key until Alt+Down moves into it. Then arrows, Page Up,
 * Page Down, Home and End move, Enter or Tab puts the entry in the editor
 * for the editor to commit, Escape leaves the list, and any other key types
 * on. A click on an entry puts it in the cell. Only while the caret is at
 * the end of the text, and never a formula. The column is read at the first
 * typed character: a change that is not typed (a paste, a deletion) lists
 * entries only once one was, so opening an edit and changing its text never
 * waits for the read.
 */
class CellCompletion implements EditCompletion {
  private readonly lookup: (typed: string) => CompletionLookup;
  private readonly list_host: HTMLElement;
  private readonly theme: Theme;
  private readonly commit: () => void;
  private list: EntryList | null = null;
  /** Alt+Down moved into the list, so the list keys act on it. */
  private in_list = false;
  /** A typed character has looked the text up, so later changes list too. */
  private looked_up = false;

  constructor(
    lookup: (typed: string) => CompletionLookup,
    listHost: HTMLElement,
    theme: Theme,
    commit: () => void,
  ) {
    this.lookup = lookup;
    this.list_host = listHost;
    this.theme = theme;
    this.commit = commit;
  }

  complete(field: HTMLTextAreaElement, typed: boolean): string | null {
    const text = field.value;
    const at_end = field.selectionStart === text.length && field.selectionEnd === text.length;
    let found = NO_MATCH;
    if (at_end && !text.startsWith("=") && (typed || this.looked_up)) {
      this.looked_up = true;
      found = this.lookup(text);
    }
    this.show_list(field, found.matches);
    const { entry } = found;
    if (!typed || entry === null || entry.length <= text.length) return null;
    field.value = text + entry.slice(text.length);
    field.setSelectionRange(text.length, field.value.length);
    return entry;
  }

  keyDown(event: KeyboardEvent, field: HTMLTextAreaElement): boolean {
    const list = this.list;
    if (list === null) return false;
    if (!this.in_list) {
      if (event.key !== "ArrowDown" || !event.altKey || event.ctrlKey || event.metaKey) {
        return false;
      }
      this.enter_list(field, list, true);
      list.select(0);
      field.setAttribute("aria-activedescendant", list.activeId);
      return true;
    }
    if (list.moveFor(event.key)) {
      field.setAttribute("aria-activedescendant", list.activeId);
      return true;
    }
    const entry = list.active;
    this.enter_list(field, list, false);
    if (event.key === "Escape") return true;
    if ((event.key === "Enter" || event.key === "Tab") && entry !== undefined) {
      field.value = entry;
      field.setSelectionRange(entry.length, entry.length);
    }
    return false;
  }

  reposition(field: HTMLTextAreaElement): void {
    this.list?.position({
      x: field.offsetLeft,
      y: field.offsetTop,
      w: field.offsetWidth,
      h: field.offsetHeight,
    });
  }

  close(): void {
    this.list?.remove();
    this.list = null;
    this.in_list = false;
  }

  /** Show `matches` under the field, with none selected; fewer than two close the list. */
  private show_list(field: HTMLTextAreaElement, matches: readonly string[]): void {
    if (matches.length < 2) {
      if (this.list !== null) field.removeAttribute("aria-controls");
      this.close();
      return;
    }
    const list = (this.list ??= new EntryList(
      this.list_host,
      "AutoComplete",
      this.theme,
      (entry) => {
        field.value = entry;
        this.commit();
      },
    ));
    this.enter_list(field, list, false);
    list.show(matches, 0);
    list.deselect();
    field.setAttribute("aria-controls", list.element.id);
    this.reposition(field);
  }

  /** Move the list keys into the list, or back to the editor. */
  private enter_list(field: HTMLTextAreaElement, list: EntryList, in_list: boolean): void {
    this.in_list = in_list;
    if (in_list) return;
    list.deselect();
    field.removeAttribute("aria-activedescendant");
  }
}

/**
 * The cell editor's AutoComplete for an edit of view row `row` in `col`,
 * with its list in `listHost`; `commit` stores a clicked entry. Null for a
 * store without an engine.
 */
export function editCompletion(
  host: CompletionHost,
  row: number,
  col: number,
  listHost: HTMLElement,
  theme: Theme,
  commit: () => void,
): EditCompletion | null {
  const engine = storeEngine(host.store);
  if (engine === null) return null;
  const lookup = columnCompletions(completion_sheet(host, engine), row, col);
  return new CellCompletion(lookup, listHost, theme, commit);
}
