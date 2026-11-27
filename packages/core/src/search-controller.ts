import { cellScalarToText, formulaBarText, parseCellInput } from "./cell-input.js";
import { getEngine } from "./engine.js";
import { isGeneralCode } from "./general-format.js";
import { formatNumber } from "./number-format.js";
import { findMatcher, replaceInText } from "./search-replace.js";
import type { SelRect } from "./selection.js";
import type { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar, CellStyle, CellValue } from "./types/cell.js";
import type { CellAddress, SheetId } from "./types/coordinates.js";
import type { DocumentOp, Sheet, SnapshotCell } from "./types/document.js";
import type {
  ReplaceChange,
  ReplacePreview,
  ReplaceResult,
  SearchOptions,
  SearchResult,
} from "./types/grid.js";
import type { ResolvedCell, Store } from "./types/store.js";

export interface SearchControllerDeps {
  store: Store;
  loadable: SheetwriteStore | null;
  activeSheet: () => SheetId;
  /** Show another sheet, as moving to a match there does. */
  activateSheet: (sheet: SheetId) => void;
  sheet: (id?: SheetId) => Sheet;
  toViewRow: (dataRow: number) => number | null;
  viewportAnchor: () => { row: number; col: number };
  scrollToCell: (addr: CellAddress) => void;
  /** Select one cell, in view rows. */
  selectCell: (addr: CellAddress) => void;
  /** Move the active cell to `addr`, in view rows, and keep the selected cells. */
  setActiveCell: (addr: CellAddress) => void;
  /**
   * The selected rectangles of the active sheet, in view rows, when they hold
   * more than one cell; null for one cell or one merged cell.
   */
  selectionScope: () => readonly SelRect[] | null;
  scheduleRender: () => void;
  emit: (result: SearchResult) => void;
  /** Whether writes are disabled; replace becomes a no-op. */
  readOnly: () => boolean;
  /** Route replacement writes through the grid so they land on the undo stack. */
  commit: (patches: DocumentOp[]) => void;
}

export interface SearchMatchSet {
  readonly sheet: SheetId | null;
  readonly length: number;
  at(index: number): CellAddress | null;
  rowAt(index: number): number;
  colAt(index: number): number;
  materialize(): CellAddress[];
}

class FlatSearchMatchSet implements SearchMatchSet {
  readonly length: number;

  constructor(
    readonly sheet: SheetId | null,
    private readonly pairs: Uint32Array,
  ) {
    this.length = pairs.length >>> 1;
  }

  at(index: number): CellAddress | null {
    if (index < 0 || index >= this.length || !this.sheet) return null;
    const offset = index << 1;
    return {
      sheet: this.sheet,
      row: this.pairs[offset]!,
      col: this.pairs[offset + 1]!,
    };
  }

  rowAt(index: number): number {
    return index >= 0 && index < this.length ? (this.pairs[index << 1] ?? -1) : -1;
  }

  colAt(index: number): number {
    return index >= 0 && index < this.length ? (this.pairs[(index << 1) + 1] ?? -1) : -1;
  }

  materialize(): CellAddress[] {
    if (!this.sheet || this.length === 0) return [];
    const matches = new Array<CellAddress>(this.length);
    for (let i = 0; i < this.length; i++) {
      const offset = i << 1;
      matches[i] = {
        sheet: this.sheet,
        row: this.pairs[offset]!,
        col: this.pairs[offset + 1]!,
      };
    }
    return matches;
  }
}

const EMPTY_MATCHES = new FlatSearchMatchSet(null, new Uint32Array(0));

/** One sheet's matches, its place in the tab order, and its first index in the whole list. */
interface SheetMatches {
  readonly sheet: SheetId;
  readonly tab: number;
  readonly set: SearchMatchSet;
  readonly start: number;
}

/** Every match of a search: sheets in tab order, each sheet's matches in search order. */
class MatchList {
  readonly length: number;
  readonly sheets: readonly SheetMatches[];

  constructor(parts: readonly Omit<SheetMatches, "start">[]) {
    let start = 0;
    this.sheets = parts.map((part) => {
      const sheet = { ...part, start };
      start += part.set.length;
      return sheet;
    });
    this.length = start;
  }

  find(sheet: SheetId): SheetMatches | undefined {
    return this.sheets.find((part) => part.sheet === sheet);
  }

  /** The sheet that holds match `index`. */
  locate(index: number): SheetMatches | undefined {
    if (index < 0 || index >= this.length) return undefined;
    let found: SheetMatches | undefined;
    for (const part of this.sheets) {
      if (part.start > index) break;
      found = part;
    }
    return found;
  }

  at(index: number): CellAddress | null {
    const part = this.locate(index);
    return part ? part.set.at(index - part.start) : null;
  }

  indexOf(addr: CellAddress): number {
    const part = this.find(addr.sheet);
    if (!part) return -1;
    for (let index = 0; index < part.set.length; index++) {
      if (part.set.rowAt(index) === addr.row && part.set.colAt(index) === addr.col)
        return part.start + index;
    }
    return -1;
  }

  materialize(): CellAddress[] {
    return this.sheets.flatMap((part) => part.set.materialize());
  }
}

const NO_MATCHES = new MatchList([]);

/** One replacement: the change it shows, and the style its cell keeps. */
interface Planned {
  readonly change: ReplaceChange;
  readonly style?: ResolvedCell["style"];
}

/** The changes Replace all makes, and the operations that write them when it writes. */
interface ReplacePlan {
  readonly patches: DocumentOp[];
  /** The first `limit` changes. */
  readonly changes: ReplaceChange[];
  readonly limit: number;
  /** How many changes it makes, and how many of them rewrite a formula. */
  total: number;
  formulas: number;
}

/** How many changes the Replace all preview lists unless told otherwise. */
const DEFAULT_PREVIEW_LIMIT = 1_000;

/** Count `change` in `plan`, and list it while the plan lists fewer than its limit. */
function add_change(plan: ReplacePlan, change: ReplaceChange): void {
  plan.total += 1;
  if (change.kind === "formula") plan.formulas += 1;
  if (plan.changes.length < plan.limit) plan.changes.push(change);
}

/** Whether two lists hold the same cells in the same order. */
function same_matches(next: MatchList, previous: MatchList): boolean {
  if (next.length !== previous.length || next.sheets.length !== previous.sheets.length)
    return false;
  return next.sheets.every((part, index) => {
    const other = previous.sheets[index];
    if (other?.sheet !== part.sheet) return false;
    for (let match = 0; match < part.set.length; match++) {
      if (
        part.set.rowAt(match) !== other.set.rowAt(match) ||
        part.set.colAt(match) !== other.set.colAt(match)
      )
        return false;
    }
    return true;
  });
}

/**
 * Whether cell (row, col) comes before (other_row, other_col) in Excel's search
 * order: across each row, or down each column for Search: By Columns.
 */
function precedes(
  by_columns: boolean,
  row: number,
  col: number,
  other_row: number,
  other_col: number,
): boolean {
  return by_columns
    ? col < other_col || (col === other_col && row < other_row)
    : row < other_row || (row === other_row && col < other_col);
}

/** `[row, col, ...]` pairs sorted into search order. */
function sort_pairs(pairs: Uint32Array, by_columns: boolean): Uint32Array {
  const order = Array.from({ length: pairs.length >>> 1 }, (_, index) => index);
  order.sort((left, right) => {
    const left_row = pairs[left << 1] ?? 0;
    const left_col = pairs[(left << 1) + 1] ?? 0;
    const right_row = pairs[right << 1] ?? 0;
    const right_col = pairs[(right << 1) + 1] ?? 0;
    if (precedes(by_columns, left_row, left_col, right_row, right_col)) return -1;
    return precedes(by_columns, right_row, right_col, left_row, left_col) ? 1 : 0;
  });
  const sorted = new Uint32Array(pairs.length);
  for (const [position, index] of order.entries()) {
    sorted[position << 1] = pairs[index << 1] ?? 0;
    sorted[(position << 1) + 1] = pairs[(index << 1) + 1] ?? 0;
  }
  return sorted;
}

/** Case folding matches the engine's only for ASCII; any wider code unit rescans. */
const NON_ASCII = /[\u0080-\uffff]/;
// Rust `{}` and JS `String()` print an f64 the same way only in this range.
const MIN_PLAIN_NUMBER = 1e-6;
const MAX_PLAIN_NUMBER = 1e21;

/**
 * Text the engine's search sees for a stored scalar, or null when JS cannot
 * reproduce it exactly (exponent forms, `-0`, infinities). Callers rescan then.
 */
function engine_search_text(value: CellScalar): string | null {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  const magnitude = Math.abs(value);
  const plain =
    Object.is(value, 0) || (magnitude >= MIN_PLAIN_NUMBER && magnitude < MAX_PLAIN_NUMBER);
  return plain ? String(value) : null;
}

/**
 * The text Find compares for a number in a number format other than General,
 * as Excel's Find does: the formula bar's text (`1/15/2026`, `15%`) when it
 * looks in formulas, the shown text (`$4.50`) when it looks in values. Null
 * for anything else, and for a number the formula bar shows as stored, which
 * the engine compares as it is.
 */
function formatted_number_text(
  value: CellScalar | undefined,
  format: string | undefined,
  locale: string | undefined,
  look_in: "formulas" | "values",
): string | null {
  if (typeof value !== "number" || isGeneralCode(format)) return null;
  return look_in === "values"
    ? formatNumber(value, format, locale)
    : formulaBarText(value, format, locale);
}

/** Rows a formatted-number pass reads at once, so a large sheet is read in bounded windows. */
const FORMATTED_SCAN_ROWS = 16_384;

/**
 * Owns find state and match scanning, then asks the grid shell to reveal and
 * repaint the active match.
 */
export class SearchController {
  private readonly deps: SearchControllerDeps;
  private found: MatchList = NO_MATCHES;
  private search_active = -1;
  private search_query = "";
  private search_opts: SearchOptions = {};
  private search_matcher: (text: string) => boolean = () => false;
  /** The selection a search runs in, in view rows; null searches the whole sheet. */
  private search_scope: { sheet: SheetId; rects: readonly SelRect[] } | null = null;
  private revision = 0;

  constructor(deps: SearchControllerDeps) {
    this.deps = deps;
  }

  /** The active sheet's matches, which the overlay paints. */
  get matches(): SearchMatchSet {
    return this.found.find(this.deps.activeSheet())?.set ?? EMPTY_MATCHES;
  }

  /** The active match's index in {@link matches}, or -1 when it is on another sheet. */
  get active(): number {
    const part = this.found.locate(this.search_active);
    return part?.sheet === this.deps.activeSheet() ? this.search_active - part.start : -1;
  }

  get version(): number {
    return this.revision;
  }

  /**
   * Refresh without scrolling: ordinary edits must not move the user's viewport.
   *
   * A literal edit's own match state is a complete check only when the sheet
   * has no formulas or references. Otherwise an input on any sheet can change
   * a computed match elsewhere, so the search must rescan conservatively.
   */
  refreshAfterChange(
    patches: readonly DocumentOp[],
    activeSheet: SheetId,
    independentCells: boolean,
  ): void {
    if (!this.search_query) return;
    const previous = this.found;
    const only = previous.sheets.length === 1 ? previous.sheets[0] : undefined;
    if (
      independentCells &&
      this.search_opts.within !== "workbook" &&
      this.search_opts.lookIn !== "notes" &&
      only?.sheet === activeSheet &&
      patches.every((patch) => this.preserves_match_membership(patch, activeSheet, only.set))
    )
      return;
    const next = this.scan_all(this.search_query, this.search_opts);
    // Retain the match identity and row index when only values changed.
    if (same_matches(next, previous)) return;

    const active = previous.at(this.search_active);
    this.found = next;
    const kept = active ? next.indexOf(active) : -1;
    this.search_active = kept >= 0 ? kept : next.length > 0 ? 0 : -1;
    this.revision += 1;
    this.emit_search();
  }

  private preserves_match_membership(
    patch: DocumentOp,
    sheet: SheetId,
    matches: SearchMatchSet,
  ): boolean {
    if (patch.op === "setNote") return true;
    // A number format changes the text a number shows, and so what matches.
    if (patch.op === "setRangeStyle") {
      return patch.style !== null && patch.style.numberFormat === undefined;
    }
    if (patch.op !== "set") return false;
    if (patch.addr.sheet !== sheet) return true;
    if (patch.value.kind !== "literal") return false;
    if (this.search_opts.columns && !this.search_opts.columns.includes(patch.addr.col)) return true;
    // A cell outside the searched selection is never a match.
    if (!this.in_scope(sheet, patch.addr.row, patch.addr.col)) return true;

    const cell = this.deps.store.getCell(patch.addr);
    const text = this.formatted_text(patch.addr, cell) ?? engine_search_text(cell.resolved);
    if (text === null) return false;
    if (!this.search_opts.matchCase && (NON_ASCII.test(text) || NON_ASCII.test(this.search_query)))
      return false;
    const matches_now = this.search_matcher(text);
    const by_columns = this.search_opts.searchBy === "columns";
    const { row, col } = patch.addr;
    let start = 0;
    let end = matches.length;
    while (start < end) {
      const middle = start + ((end - start) >>> 1);
      if (precedes(by_columns, matches.rowAt(middle), matches.colAt(middle), row, col))
        start = middle + 1;
      else end = middle;
    }
    const matched_before = matches.rowAt(start) === row && matches.colAt(start) === col;
    return matches_now === matched_before;
  }

  /**
   * Find `query` on a sheet, or on every visible sheet when `within` is
   * `"workbook"`. On the active sheet a selection of more than one cell limits
   * a sheet search to it, as in Excel.
   */
  search(query: string, opts: SearchOptions = {}): SearchResult {
    this.search_query = query;
    this.search_opts = opts;
    this.search_matcher = findMatcher(query, opts);
    const active_sheet = this.deps.activeSheet();
    const sheet = opts.sheet ?? active_sheet;
    const rects =
      opts.within !== "workbook" && sheet === active_sheet ? this.deps.selectionScope() : null;
    this.search_scope = rects ? { sheet, rects } : null;
    this.found = query ? this.scan_all(query, opts) : NO_MATCHES;
    this.search_active = this.start_index();
    this.revision += 1;
    this.reveal_active_match();
    this.deps.scheduleRender();
    return this.emit_search();
  }

  findNext(): SearchResult {
    if (this.found.length > 0) {
      this.search_active = (this.search_active + 1) % this.found.length;
      this.revision += 1;
      this.reveal_active_match();
      this.deps.scheduleRender();
    }
    return this.emit_search();
  }

  findPrev(): SearchResult {
    if (this.found.length > 0) {
      const n = this.found.length;
      this.search_active = (this.search_active - 1 + n) % n;
      this.revision += 1;
      this.reveal_active_match();
      this.deps.scheduleRender();
    }
    return this.emit_search();
  }

  /** Make match `index` the active match, then select it and scroll to it. */
  selectMatch(index: number): SearchResult {
    if (Number.isInteger(index) && index >= 0 && index < this.found.length) {
      this.search_active = index;
      this.revision += 1;
      this.reveal_active_match();
      this.deps.scheduleRender();
    }
    return this.emit_search();
  }

  clearSearch(): void {
    this.search_query = "";
    this.search_scope = null;
    this.found = NO_MATCHES;
    this.search_active = -1;
    this.revision += 1;
    this.deps.scheduleRender();
    this.emit_search();
  }

  /**
   * Replace the active match, then advance to the next match after it (in
   * search order, wrapping). A formula's text is rewritten unless the search
   * looks in values; reference cells are skipped. The active pointer still
   * advances so the caller is never stuck.
   */
  replaceCurrent(replacement: string): SearchResult {
    const target = this.found.at(this.search_active);
    if (this.deps.readOnly() || !target) return this.emit_search();

    const planned = this.replacement_patch(target, replacement);
    if (planned) {
      this.deps.commit([this.patch_of(planned)]);
      this.found = this.scan_all(this.search_query, this.search_opts);
    }
    this.search_active = this.advance_after(target);
    this.revision += 1;
    this.reveal_active_match();
    this.deps.scheduleRender();
    return this.emit_search();
  }

  /**
   * The first `limit` changes {@link replaceAll} would make, in search order,
   * and how many it makes, without writing anything. Both come from one plan,
   * so the preview shows exactly what Replace all writes. Empty on a
   * read-only grid.
   */
  previewReplaceAll(replacement: string, limit = DEFAULT_PREVIEW_LIMIT): ReplacePreview {
    if (this.deps.readOnly()) return { changes: [], total: 0, formulas: 0 };
    const { changes, total, formulas } = this.plan_replace_all(replacement, false, limit);
    return { changes, total, formulas };
  }

  /**
   * Replace every current match in one transaction (a single undo step), then
   * re-scan. Skipped formula/ref cells are not counted. The view stays on the
   * active sheet.
   */
  replaceAll(replacement: string): ReplaceResult {
    if (this.deps.readOnly()) {
      return { replaced: 0, result: this.emit_search() };
    }

    const { patches, total } = this.plan_replace_all(replacement, true, Number.POSITIVE_INFINITY);
    if (patches.length > 0) {
      this.deps.commit(patches);
      this.found = this.scan_all(this.search_query, this.search_opts);
      const own = this.found.find(this.deps.activeSheet());
      this.search_active = this.found.length > 0 ? (own?.start ?? 0) : -1;
      this.revision += 1;
      this.reveal_active_match(false);
      this.deps.scheduleRender();
    }
    return { replaced: total, result: this.emit_search() };
  }

  /**
   * Plan Replace all over every match. The preview passes `writes: false`:
   * it needs only the changes, so it skips reading the new text into values,
   * and it lists only the first `limit`.
   */
  private plan_replace_all(replacement: string, writes: boolean, limit: number): ReplacePlan {
    const plan: ReplacePlan = { patches: [], changes: [], limit, total: 0, formulas: 0 };
    for (const part of this.found.sheets) {
      const matches = part.set.materialize();
      if (this.search_opts.lookIn === "notes")
        this.plan_note_replacements(part.sheet, matches, replacement, plan, writes);
      else this.plan_cell_replacements(part.sheet, matches, replacement, plan, writes);
    }
    return plan;
  }

  /** Add the replacements in one sheet's cells to `plan`. */
  private plan_cell_replacements(
    sheet: SheetId,
    matches: readonly CellAddress[],
    replacement: string,
    plan: ReplacePlan,
    writes: boolean,
  ): void {
    const engine = storeEngine(this.deps.store);
    const captured = engine?.captureCells(sheet, matches);
    const metadata = this.deps.sheet(sheet);
    // One `set` per cell without an engine, or with validation rules, protected
    // ranges or spill children: the mutation policy then reports each issue at its
    // own cell's operation index, and a write into a spill child can be refused alone.
    const scalar_writes =
      !engine ||
      Boolean(
        metadata.validationRules?.length ||
        metadata.protectedRanges?.length ||
        captured?.some((cell) => cell.isSpillChild),
      );
    const cells: SnapshotCell[] = [];
    let end_row = 0;
    let end_col = 0;
    for (const [index, addr] of matches.entries()) {
      const cell = captured?.[index];
      // A store without an engine captures no cells: plan from its own reads.
      const planned = !cell
        ? this.cell_replacement(addr, replacement)
        : cell.value.kind === "formula"
          ? this.formula_replacement(addr, replacement, cell.value.src, cell.style)
          : cell.value.kind === "ref"
            ? null
            : this.replacement_from_cell(addr, replacement, cell);
      if (!planned) continue;
      add_change(plan, planned.change);
      if (!writes) continue;
      if (scalar_writes) {
        plan.patches.push(this.patch_of(planned));
        continue;
      }

      cells.push({
        rowOffset: addr.row,
        colOffset: addr.col,
        value: this.value_of(planned.change),
        style: planned.style,
      });
      end_row = Math.max(end_row, addr.row);
      end_col = Math.max(end_col, addr.col);
    }

    if (cells.length === 0) return;
    plan.patches.push({
      op: "setRange",
      range: { sheet, start: { row: 0, col: 0 }, end: { row: end_row, col: end_col } },
      cells,
    });
  }

  /** Add the replacements in one sheet's notes to `plan`. */
  private plan_note_replacements(
    sheet: SheetId,
    matches: readonly CellAddress[],
    replacement: string,
    plan: ReplacePlan,
    writes: boolean,
  ): void {
    const notes = new Map<string, string>();
    for (const note of this.deps.sheet(sheet).notes ?? []) {
      notes.set(`${note.addr.row}:${note.addr.col}`, note.text);
    }
    for (const addr of matches) {
      const planned = this.note_replacement(
        addr,
        notes.get(`${addr.row}:${addr.col}`),
        replacement,
      );
      if (!planned) continue;
      add_change(plan, planned.change);
      if (writes) plan.patches.push(this.patch_of(planned));
    }
  }

  /** The operation that writes one planned change. */
  private patch_of({ change, style }: Planned): DocumentOp {
    const { addr, kind, after } = change;
    return kind === "note"
      ? { op: "setNote", addr, text: after }
      : { op: "set", addr, value: this.value_of(change), style };
  }

  /**
   * The value a changed cell holds: the new formula, or the new text read as
   * if typed into its column, so numbers stay numbers.
   */
  private value_of({ addr, kind, after }: ReplaceChange): CellValue {
    if (kind === "formula" && after.startsWith("=")) return { kind: "formula", src: after };
    const type = this.deps.sheet(addr.sheet).columns[addr.col]?.type ?? "text";
    const value = parseCellInput(after, type);
    // A number column reads `25%` or `1/16/2026`, the text of a formatted
    // number, as General reads it; the cell keeps its format.
    if (type !== "text" && value.kind === "literal" && typeof value.value === "string") {
      const general = parseCellInput(after, "general");
      if (general.kind === "literal" && typeof general.value === "number") return general;
    }
    return value;
  }

  /** The change that rewrites a note's text, or null when nothing in it matches. */
  private note_replacement(
    addr: CellAddress,
    text: string | undefined,
    replacement: string,
  ): Planned | null {
    if (text === undefined) return null;
    const next = replaceInText(text, this.search_query, replacement, this.search_opts);
    if (next === null) return null;
    return { change: { addr, kind: "note", before: text, after: next } };
  }

  /** The replacement in one match: its note, or its cell. */
  private replacement_patch(addr: CellAddress, replacement: string): Planned | null {
    if (this.search_opts.lookIn !== "notes") return this.cell_replacement(addr, replacement);
    const note = this.deps
      .sheet(addr.sheet)
      .notes?.find((entry) => entry.addr.row === addr.row && entry.addr.col === addr.col);
    return this.note_replacement(addr, note?.text, replacement);
  }

  /**
   * The change that rewrites `addr` for the current query, or null when the
   * cell is not eligible (a reference, or a formula in a value search) or
   * holds no occurrence to replace. The cell keeps its style.
   */
  private cell_replacement(addr: CellAddress, replacement: string): Planned | null {
    if (this.deps.store.getRefTarget(addr) !== null) return null;
    const formula = this.deps.store.getFormula(addr);
    if (formula !== null) {
      return this.formula_replacement(
        addr,
        replacement,
        formula,
        this.deps.store.getCell(addr).style,
      );
    }

    return this.replacement_from_cell(addr, replacement, this.deps.store.getCell(addr));
  }

  /**
   * Rewrite a formula's text, as Excel's Replace does: null when the search
   * looks in values, when nothing in the text matches, or when the new text is
   * not a formula the engine can read. Text that no longer starts with `=` is
   * entered as a value.
   */
  private formula_replacement(
    addr: CellAddress,
    replacement: string,
    source: string,
    style: ResolvedCell["style"],
  ): Planned | null {
    if (this.search_opts.lookIn === "values") return null;
    const next = replaceInText(source, this.search_query, replacement, this.search_opts);
    if (next === null) return null;
    const planned: Planned = {
      change: { addr, kind: "formula", before: source, after: next },
      style,
    };
    if (!next.startsWith("=")) return planned;

    const error = getEngine().checkFormulaSyntax(next);
    if (error === undefined) return planned;
    error.free();
    return null;
  }

  private replacement_from_cell(
    addr: CellAddress,
    replacement: string,
    cell: Pick<ResolvedCell, "resolved" | "style">,
  ): Planned | null {
    // A formatted number is replaced in the text Find compared.
    const text = this.formatted_text(addr, cell) ?? cellScalarToText(cell.resolved);
    const next = replaceInText(text, this.search_query, replacement, this.search_opts);
    if (next === null) return null;
    return { change: { addr, kind: "value", before: text, after: next }, style: cell.style };
  }

  /** {@link formatted_number_text} of one cell, in its own format or its column's. */
  private formatted_text(
    addr: CellAddress,
    cell: Pick<ResolvedCell, "resolved" | "style">,
  ): string | null {
    if (typeof cell.resolved !== "number") return null;
    const column = this.deps.sheet(addr.sheet).columns[addr.col];
    return formatted_number_text(
      cell.resolved,
      cell.style.numberFormat ?? column?.numberFormat,
      column?.numberLocale,
      this.search_opts.lookIn === "values" ? "values" : "formulas",
    );
  }

  /** The sheet's place in the tab order. */
  private tab_of(sheet: SheetId): number {
    return this.deps.store.getWorkbook().sheets.findIndex((entry) => entry.id === sheet);
  }

  /**
   * Index of the first match after `prev` in search order: later on its sheet,
   * then on the next sheet in tab order, wrapping to 0.
   */
  private advance_after(prev: CellAddress): number {
    const found = this.found;
    if (found.length === 0) return -1;
    const by_columns = this.search_opts.searchBy === "columns";
    const part = found.find(prev.sheet);
    if (part) {
      for (let index = 0; index < part.set.length; index++) {
        if (precedes(by_columns, prev.row, prev.col, part.set.rowAt(index), part.set.colAt(index)))
          return part.start + index;
      }
    }
    const tab = this.tab_of(prev.sheet);
    return found.sheets.find((entry) => entry.tab > tab)?.start ?? 0;
  }

  /**
   * The match a new search starts at: the first at or after the viewport's
   * top-left cell, in view order. Without one, a workbook search goes on to
   * the next sheet that has a match, as Excel's does, and a sheet search wraps
   * to its first match in view order.
   */
  private start_index(): number {
    const found = this.found;
    const active_sheet = this.deps.activeSheet();
    const workbook = this.search_opts.within === "workbook";
    const own = workbook ? found.find(active_sheet) : found.sheets[0];
    const viewport = own ? this.viewport_matches(own.set, this.deps.viewportAnchor()) : null;
    if (own && viewport && viewport.after >= 0) return own.start + viewport.after;
    if (workbook) {
      const tab = this.tab_of(active_sheet);
      const next =
        found.sheets.find((part) => part.tab > tab) ?? found.sheets.find((part) => part !== own);
      if (next) return next.start;
    }
    return own && viewport && viewport.first >= 0 ? own.start + viewport.first : -1;
  }

  /**
   * The first match at or after the viewport's top-left cell in current view
   * order, and the earliest match in view order, or -1 for each. Search
   * results stay in data space; sorted views are mapped here.
   */
  private viewport_matches(
    matches: SearchMatchSet,
    anchor: { row: number; col: number },
  ): { after: number; first: number } {
    const by_columns = this.search_opts.searchBy === "columns";
    let first_index = -1;
    let first_row = Number.MAX_SAFE_INTEGER;
    let first_col = Number.MAX_SAFE_INTEGER;
    let after_index = -1;
    let after_row = Number.MAX_SAFE_INTEGER;
    let after_col = Number.MAX_SAFE_INTEGER;

    for (let i = 0; i < matches.length; i++) {
      const view_row = this.deps.toViewRow(matches.rowAt(i));
      if (view_row === null) continue;
      const col = matches.colAt(i);
      if (precedes(by_columns, view_row, col, first_row, first_col)) {
        first_index = i;
        first_row = view_row;
        first_col = col;
      }
      const at_or_after = !precedes(by_columns, view_row, col, anchor.row, anchor.col);
      if (at_or_after && precedes(by_columns, view_row, col, after_row, after_col)) {
        after_index = i;
        after_row = view_row;
        after_col = col;
      }
    }
    return { after: after_index, first: first_index };
  }

  /** Scan the searched sheet, or every visible sheet in tab order for a workbook search. */
  private scan_all(query: string, opts: SearchOptions): MatchList {
    const parts: Omit<SheetMatches, "start">[] = [];
    if (opts.within === "workbook") {
      for (const [tab, sheet] of this.deps.store.getWorkbook().sheets.entries()) {
        // Excel's Find skips hidden sheets.
        if ((sheet.visibility ?? "visible") !== "visible") continue;
        const set = this.scan_matches(sheet.id, query, opts);
        if (set.length > 0) parts.push({ sheet: sheet.id, tab, set });
      }
    } else {
      const sheet = opts.sheet ?? this.deps.activeSheet();
      const set = this.scan_matches(sheet, query, opts);
      if (set.length > 0) parts.push({ sheet, tab: this.tab_of(sheet), set });
    }
    return parts.length === 0 ? NO_MATCHES : new MatchList(parts);
  }

  /** Scan one sheet, keeping only matches inside the searched selection, in search order. */
  private scan_matches(sheet_id: SheetId, query: string, opts: SearchOptions): SearchMatchSet {
    const scope = this.search_scope?.sheet === sheet_id ? this.search_scope : null;
    let columns = opts.columns;
    if (scope) {
      const scoped = new Set<number>();
      for (const rect of scope.rects) {
        for (let col = rect.c0; col <= rect.c1; col++) {
          if (!columns || columns.includes(col)) scoped.add(col);
        }
      }
      columns = [...scoped];
    }

    const notes = opts.lookIn === "notes";
    let pairs = notes
      ? this.scan_notes(sheet_id, columns)
      : this.scan_cells(sheet_id, query, { ...opts, columns });
    if (scope) {
      const kept: number[] = [];
      for (let offset = 0; offset < pairs.length; offset += 2) {
        const row = pairs[offset] ?? 0;
        const col = pairs[offset + 1] ?? 0;
        if (this.in_scope(sheet_id, row, col)) kept.push(row, col);
      }
      pairs = Uint32Array.from(kept);
    }
    // Cell scans come back across each row; notes come in the order they were added.
    const by_columns = opts.searchBy === "columns";
    if (notes || by_columns) pairs = sort_pairs(pairs, by_columns);
    return pairs.length === 0 ? EMPTY_MATCHES : new FlatSearchMatchSet(sheet_id, pairs);
  }

  /** Whether a data cell lies in the searched selection; every cell does without one. */
  private in_scope(sheet: SheetId, data_row: number, col: number): boolean {
    const scope = this.search_scope;
    if (scope?.sheet !== sheet) return true;
    const view_row = this.deps.toViewRow(data_row);
    if (view_row === null) return false;
    return scope.rects.some(
      (rect) => rect.r0 <= view_row && view_row <= rect.r1 && rect.c0 <= col && col <= rect.c1,
    );
  }

  /** `[row, col, ...]` pairs of the notes whose text matches, as Excel's Look in: Notes reads them. */
  private scan_notes(sheet_id: SheetId, columns: readonly number[] | undefined): Uint32Array {
    const pairs: number[] = [];
    for (const note of this.deps.sheet(sheet_id).notes ?? []) {
      if (columns && !columns.includes(note.addr.col)) continue;
      if (this.search_matcher(note.text)) pairs.push(note.addr.row, note.addr.col);
    }
    return Uint32Array.from(pairs);
  }

  /** Row-major `[row, col, ...]` pairs of the cells whose text matches. */
  private scan_cells(sheet_id: SheetId, query: string, opts: SearchOptions): Uint32Array {
    const look_in = opts.lookIn === "values" ? "values" : "formulas";
    // Fast path: scan the columnar store in WASM (no per-cell JS materialization),
    // then correct it for numbers in a number format, which it reads as stored.
    if (this.deps.loadable) {
      const found = this.deps.loadable.searchCellsFlat(sheet_id, query, {
        ...opts,
        lookIn: look_in,
      });
      return this.with_formatted_numbers(this.deps.loadable, sheet_id, query, opts, found);
    }

    // Fallback for a non-SheetwriteStore store: bulk-read the sheet and scan in JS.
    const sheet = this.deps.sheet(sheet_id);
    const cols = opts.columns ?? sheet.columns.map((_, i) => i);
    const matches = findMatcher(query, opts);
    const formulas = look_in === "formulas";
    const pairs: number[] = [];
    if (sheet.rowCount === 0 || cols.length === 0) return new Uint32Array(0);

    // Matches are data addresses. A custom store's visible window can follow its
    // own sort or filter, so read canonical data rows when the store offers them.
    const rows = { start: 0, end: sheet.rowCount };
    const view =
      this.deps.store.getDataWindow?.(sheet_id, rows, cols) ??
      this.deps.store.getVisibleWindow(sheet_id, rows, cols);
    const n = cols.length;
    for (let r = 0; r < sheet.rowCount; r++) {
      for (let c = 0; c < n; c++) {
        const index = r * n + c;
        const v = view.values[index];
        if (v === null || v === undefined || v === "") continue;
        const column = sheet.columns[cols[c]!];
        const formula = formulas
          ? this.deps.store.getFormula({ sheet: sheet_id, row: r, col: cols[c]! })
          : null;
        const shown = formatted_number_text(
          v,
          view.styles[view.styleIds[index] ?? 0]?.numberFormat ?? column?.numberFormat,
          column?.numberLocale,
          look_in,
        );
        if (matches(formula ?? shown ?? String(v))) {
          pairs.push(r, cols[c]!);
        }
      }
    }
    return Uint32Array.from(pairs);
  }

  /**
   * The engine's matches, corrected for numbers in a number format other than
   * General: the engine compares a number as stored (`0.15`), Excel the text
   * Find reads for it (`15%`). Sheets without such formats keep the engine's
   * matches unread. Otherwise only the columns that can hold them are read,
   * in bounded windows, and only formatted numbers are compared.
   */
  private with_formatted_numbers(
    store: SheetwriteStore,
    sheet_id: SheetId,
    query: string,
    opts: SearchOptions,
    found: Uint32Array,
  ): Uint32Array {
    const sheet = this.deps.sheet(sheet_id);
    const searched = opts.columns ?? sheet.columns.map((_, index) => index);
    // A cell's own format can sit in any column; a column's format only in its own.
    const styles = storeEngine(store)?.styleTable();
    const cell_formats =
      styles === undefined || styles.some((style: CellStyle) => !isGeneralCode(style.numberFormat));
    const cols = cell_formats
      ? searched
      : searched.filter((col) => !isGeneralCode(sheet.columns[col]?.numberFormat));
    if (cols.length === 0 || sheet.rowCount === 0) return found;

    const look_in = opts.lookIn === "values" ? "values" : "formulas";
    const width = sheet.columns.length;
    const engine_matches = new Set<number>();
    for (let offset = 0; offset < found.length; offset += 2) {
      engine_matches.add((found[offset] ?? 0) * width + (found[offset + 1] ?? 0));
    }
    const matches = findMatcher(query, opts);
    // Cells whose match differs from the engine's, by `row * width + col`.
    const corrected = new Map<number, boolean>();
    for (let start = 0; start < sheet.rowCount; start += FORMATTED_SCAN_ROWS) {
      const end = Math.min(sheet.rowCount, start + FORMATTED_SCAN_ROWS);
      const view = store.getDataWindow(sheet_id, { start, end }, cols);
      for (let index = 0; index < view.values.length; index++) {
        const col = cols[index % cols.length]!;
        const column = sheet.columns[col];
        const text = formatted_number_text(
          view.values[index],
          view.styles[view.styleIds[index] ?? 0]?.numberFormat ?? column?.numberFormat,
          column?.numberLocale,
          look_in,
        );
        if (text === null) continue;
        const row = start + Math.floor(index / cols.length);
        const key = row * width + col;
        const engine_matched = engine_matches.has(key);
        if (matches(text) === engine_matched) continue;
        // In formulas, a formula cell is found by its formula, as the engine read it.
        if (look_in === "formulas" && store.getFormula({ sheet: sheet_id, row, col }) !== null) {
          continue;
        }
        corrected.set(key, !engine_matched);
      }
    }
    if (corrected.size === 0) return found;

    const pairs: number[] = [];
    for (let offset = 0; offset < found.length; offset += 2) {
      const row = found[offset] ?? 0;
      const col = found[offset + 1] ?? 0;
      if (corrected.get(row * width + col) !== false) pairs.push(row, col);
    }
    for (const [key, matched] of corrected) {
      if (matched) pairs.push(Math.floor(key / width), key % width);
    }
    return sort_pairs(Uint32Array.from(pairs), false);
  }

  /**
   * Select the active match and scroll to it, as Excel's Find Next does. In a
   * searched selection the active cell moves and the selection stays. A match
   * on another sheet of a workbook search shows that sheet, unless
   * `switch_sheet` is false.
   */
  private reveal_active_match(switch_sheet = true): void {
    const match = this.found.at(this.search_active);
    if (!match) return;
    if (match.sheet !== this.deps.activeSheet()) {
      if (!switch_sheet || this.search_opts.within !== "workbook") return;
      this.deps.activateSheet(match.sheet);
      if (match.sheet !== this.deps.activeSheet()) return;
    }

    const view_row = this.deps.toViewRow(match.row);
    if (view_row === null) return;

    const cell = { ...match, row: view_row };
    if (this.search_scope?.sheet === match.sheet) this.deps.setActiveCell(cell);
    else this.deps.selectCell(cell);
    this.deps.scrollToCell(cell);
  }

  private emit_search(): SearchResult {
    const result: SearchResult = {
      query: this.search_query,
      matches: this.found.materialize(),
      active: this.search_active,
    };
    this.deps.emit(result);
    return result;
  }
}
