import { cellScalarToText, parseCellInput } from "./cell-input.js";
import { getEngine } from "./engine.js";
import { findMatcher, replaceInText } from "./search-replace.js";
import type { SelRect } from "./selection.js";
import type { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar, CellValue } from "./types/cell.js";
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
function addChange(plan: ReplacePlan, change: ReplaceChange): void {
  plan.total += 1;
  if (change.kind === "formula") plan.formulas += 1;
  if (plan.changes.length < plan.limit) plan.changes.push(change);
}

/** Whether two lists hold the same cells in the same order. */
function sameMatches(next: MatchList, previous: MatchList): boolean {
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
 * Whether cell (row, col) comes before (otherRow, otherCol) in Excel's search
 * order: across each row, or down each column for Search: By Columns.
 */
function precedes(
  byColumns: boolean,
  row: number,
  col: number,
  otherRow: number,
  otherCol: number,
): boolean {
  return byColumns
    ? col < otherCol || (col === otherCol && row < otherRow)
    : row < otherRow || (row === otherRow && col < otherCol);
}

/** `[row, col, ...]` pairs sorted into search order. */
function sortPairs(pairs: Uint32Array, byColumns: boolean): Uint32Array {
  const order = Array.from({ length: pairs.length >>> 1 }, (_, index) => index);
  order.sort((left, right) => {
    const leftRow = pairs[left << 1] ?? 0;
    const leftCol = pairs[(left << 1) + 1] ?? 0;
    const rightRow = pairs[right << 1] ?? 0;
    const rightCol = pairs[(right << 1) + 1] ?? 0;
    if (precedes(byColumns, leftRow, leftCol, rightRow, rightCol)) return -1;
    return precedes(byColumns, rightRow, rightCol, leftRow, leftCol) ? 1 : 0;
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
function engineSearchText(value: CellScalar): string | null {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  const magnitude = Math.abs(value);
  const plain =
    Object.is(value, 0) || (magnitude >= MIN_PLAIN_NUMBER && magnitude < MAX_PLAIN_NUMBER);
  return plain ? String(value) : null;
}

/**
 * Owns find state and match scanning, then asks the grid shell to reveal and
 * repaint the active match.
 */
export class SearchController {
  private readonly deps: SearchControllerDeps;
  private found: MatchList = NO_MATCHES;
  private searchActive = -1;
  private searchQuery = "";
  private searchOpts: SearchOptions = {};
  private searchMatcher: (text: string) => boolean = () => false;
  /** The selection a search runs in, in view rows; null searches the whole sheet. */
  private searchScope: { sheet: SheetId; rects: readonly SelRect[] } | null = null;
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
    const part = this.found.locate(this.searchActive);
    return part?.sheet === this.deps.activeSheet() ? this.searchActive - part.start : -1;
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
    if (!this.searchQuery) return;
    const previous = this.found;
    const only = previous.sheets.length === 1 ? previous.sheets[0] : undefined;
    if (
      independentCells &&
      this.searchOpts.within !== "workbook" &&
      this.searchOpts.lookIn !== "notes" &&
      only?.sheet === activeSheet &&
      patches.every((patch) => this.preservesMatchMembership(patch, activeSheet, only.set))
    )
      return;
    const next = this.scanAll(this.searchQuery, this.searchOpts);
    // Retain the match identity and row index when only values changed.
    if (sameMatches(next, previous)) return;

    const active = previous.at(this.searchActive);
    this.found = next;
    const kept = active ? next.indexOf(active) : -1;
    this.searchActive = kept >= 0 ? kept : next.length > 0 ? 0 : -1;
    this.revision += 1;
    this.emitSearch();
  }

  private preservesMatchMembership(
    patch: DocumentOp,
    sheet: SheetId,
    matches: SearchMatchSet,
  ): boolean {
    if (patch.op === "setNote" || patch.op === "setRangeStyle") return true;
    if (patch.op !== "set") return false;
    if (patch.addr.sheet !== sheet) return true;
    if (patch.value.kind !== "literal") return false;
    if (this.searchOpts.columns && !this.searchOpts.columns.includes(patch.addr.col)) return true;
    // A cell outside the searched selection is never a match.
    if (!this.inScope(sheet, patch.addr.row, patch.addr.col)) return true;

    const text = engineSearchText(this.deps.store.getCell(patch.addr).resolved);
    if (text === null) return false;
    if (!this.searchOpts.matchCase && (NON_ASCII.test(text) || NON_ASCII.test(this.searchQuery)))
      return false;
    const matchesNow = this.searchMatcher(text);
    const byColumns = this.searchOpts.searchBy === "columns";
    const { row, col } = patch.addr;
    let start = 0;
    let end = matches.length;
    while (start < end) {
      const middle = start + ((end - start) >>> 1);
      if (precedes(byColumns, matches.rowAt(middle), matches.colAt(middle), row, col))
        start = middle + 1;
      else end = middle;
    }
    const matchedBefore = matches.rowAt(start) === row && matches.colAt(start) === col;
    return matchesNow === matchedBefore;
  }

  /**
   * Find `query` on a sheet, or on every visible sheet when `within` is
   * `"workbook"`. On the active sheet a selection of more than one cell limits
   * a sheet search to it, as in Excel.
   */
  search(query: string, opts: SearchOptions = {}): SearchResult {
    this.searchQuery = query;
    this.searchOpts = opts;
    this.searchMatcher = findMatcher(query, opts);
    const activeSheet = this.deps.activeSheet();
    const sheet = opts.sheet ?? activeSheet;
    const rects =
      opts.within !== "workbook" && sheet === activeSheet ? this.deps.selectionScope() : null;
    this.searchScope = rects ? { sheet, rects } : null;
    this.found = query ? this.scanAll(query, opts) : NO_MATCHES;
    this.searchActive = this.startIndex();
    this.revision += 1;
    this.revealActiveMatch();
    this.deps.scheduleRender();
    return this.emitSearch();
  }

  findNext(): SearchResult {
    if (this.found.length > 0) {
      this.searchActive = (this.searchActive + 1) % this.found.length;
      this.revision += 1;
      this.revealActiveMatch();
      this.deps.scheduleRender();
    }
    return this.emitSearch();
  }

  findPrev(): SearchResult {
    if (this.found.length > 0) {
      const n = this.found.length;
      this.searchActive = (this.searchActive - 1 + n) % n;
      this.revision += 1;
      this.revealActiveMatch();
      this.deps.scheduleRender();
    }
    return this.emitSearch();
  }

  /** Make match `index` the active match, then select it and scroll to it. */
  selectMatch(index: number): SearchResult {
    if (Number.isInteger(index) && index >= 0 && index < this.found.length) {
      this.searchActive = index;
      this.revision += 1;
      this.revealActiveMatch();
      this.deps.scheduleRender();
    }
    return this.emitSearch();
  }

  clearSearch(): void {
    this.searchQuery = "";
    this.searchScope = null;
    this.found = NO_MATCHES;
    this.searchActive = -1;
    this.revision += 1;
    this.deps.scheduleRender();
    this.emitSearch();
  }

  /**
   * Replace the active match, then advance to the next match after it (in
   * search order, wrapping). A formula's text is rewritten unless the search
   * looks in values; reference cells are skipped. The active pointer still
   * advances so the caller is never stuck.
   */
  replaceCurrent(replacement: string): SearchResult {
    const target = this.found.at(this.searchActive);
    if (this.deps.readOnly() || !target) return this.emitSearch();

    const planned = this.replacementPatch(target, replacement);
    if (planned) {
      this.deps.commit([this.patchOf(planned)]);
      this.found = this.scanAll(this.searchQuery, this.searchOpts);
    }
    this.searchActive = this.advanceAfter(target);
    this.revision += 1;
    this.revealActiveMatch();
    this.deps.scheduleRender();
    return this.emitSearch();
  }

  /**
   * The first `limit` changes {@link replaceAll} would make, in search order,
   * and how many it makes, without writing anything. Both come from one plan,
   * so the preview shows exactly what Replace all writes. Empty on a
   * read-only grid.
   */
  previewReplaceAll(replacement: string, limit = DEFAULT_PREVIEW_LIMIT): ReplacePreview {
    if (this.deps.readOnly()) return { changes: [], total: 0, formulas: 0 };
    const { changes, total, formulas } = this.planReplaceAll(replacement, false, limit);
    return { changes, total, formulas };
  }

  /**
   * Replace every current match in one transaction (a single undo step), then
   * re-scan. Skipped formula/ref cells are not counted. The view stays on the
   * active sheet.
   */
  replaceAll(replacement: string): ReplaceResult {
    if (this.deps.readOnly()) {
      return { replaced: 0, result: this.emitSearch() };
    }

    const { patches, total } = this.planReplaceAll(replacement, true, Number.POSITIVE_INFINITY);
    if (patches.length > 0) {
      this.deps.commit(patches);
      this.found = this.scanAll(this.searchQuery, this.searchOpts);
      const own = this.found.find(this.deps.activeSheet());
      this.searchActive = this.found.length > 0 ? (own?.start ?? 0) : -1;
      this.revision += 1;
      this.revealActiveMatch(false);
      this.deps.scheduleRender();
    }
    return { replaced: total, result: this.emitSearch() };
  }

  /**
   * Plan Replace all over every match. The preview passes `writes: false`:
   * it needs only the changes, so it skips reading the new text into values,
   * and it lists only the first `limit`.
   */
  private planReplaceAll(replacement: string, writes: boolean, limit: number): ReplacePlan {
    const plan: ReplacePlan = { patches: [], changes: [], limit, total: 0, formulas: 0 };
    for (const part of this.found.sheets) {
      const matches = part.set.materialize();
      if (this.searchOpts.lookIn === "notes")
        this.planNoteReplacements(part.sheet, matches, replacement, plan, writes);
      else this.planCellReplacements(part.sheet, matches, replacement, plan, writes);
    }
    return plan;
  }

  /** Add the replacements in one sheet's cells to `plan`. */
  private planCellReplacements(
    sheet: SheetId,
    matches: readonly CellAddress[],
    replacement: string,
    plan: ReplacePlan,
    writes: boolean,
  ): void {
    const engine = storeEngine(this.deps.store);
    const captured = engine?.captureCells(sheet, matches);
    const metadata = this.deps.sheet(sheet);
    // Per-cell operations preserve policy issue indices and partial spill rejection.
    const scalarWrites =
      !engine ||
      Boolean(
        metadata.validationRules?.length ||
        metadata.protectedRanges?.length ||
        captured?.some((cell) => cell.isSpillChild),
      );
    const cells: SnapshotCell[] = [];
    let endRow = 0;
    let endCol = 0;
    for (const [index, addr] of matches.entries()) {
      const cell = captured?.[index];
      // Custom stores without an engine retain their scalar read contract.
      const planned = !cell
        ? this.cellReplacement(addr, replacement)
        : cell.value.kind === "formula"
          ? this.formulaReplacement(addr, replacement, cell.value.src, cell.style)
          : cell.value.kind === "ref"
            ? null
            : this.replacementFromCell(addr, replacement, cell);
      if (!planned) continue;
      addChange(plan, planned.change);
      if (!writes) continue;
      if (scalarWrites) {
        plan.patches.push(this.patchOf(planned));
        continue;
      }

      cells.push({
        rowOffset: addr.row,
        colOffset: addr.col,
        value: this.valueOf(planned.change),
        style: planned.style,
      });
      endRow = Math.max(endRow, addr.row);
      endCol = Math.max(endCol, addr.col);
    }

    if (cells.length === 0) return;
    plan.patches.push({
      op: "setRange",
      range: { sheet, start: { row: 0, col: 0 }, end: { row: endRow, col: endCol } },
      cells,
    });
  }

  /** Add the replacements in one sheet's notes to `plan`. */
  private planNoteReplacements(
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
      const planned = this.noteReplacement(addr, notes.get(`${addr.row}:${addr.col}`), replacement);
      if (!planned) continue;
      addChange(plan, planned.change);
      if (writes) plan.patches.push(this.patchOf(planned));
    }
  }

  /** The operation that writes one planned change. */
  private patchOf({ change, style }: Planned): DocumentOp {
    const { addr, kind, after } = change;
    return kind === "note"
      ? { op: "setNote", addr, text: after }
      : { op: "set", addr, value: this.valueOf(change), style };
  }

  /**
   * The value a changed cell holds: the new formula, or the new text read as
   * if typed into its column, so numbers stay numbers.
   */
  private valueOf({ addr, kind, after }: ReplaceChange): CellValue {
    if (kind === "formula" && after.startsWith("=")) return { kind: "formula", src: after };
    const column = this.deps.sheet(addr.sheet).columns[addr.col];
    return parseCellInput(after, column?.type ?? "text");
  }

  /** The change that rewrites a note's text, or null when nothing in it matches. */
  private noteReplacement(
    addr: CellAddress,
    text: string | undefined,
    replacement: string,
  ): Planned | null {
    if (text === undefined) return null;
    const next = replaceInText(text, this.searchQuery, replacement, this.searchOpts);
    if (next === null) return null;
    return { change: { addr, kind: "note", before: text, after: next } };
  }

  /** The replacement in one match: its note, or its cell. */
  private replacementPatch(addr: CellAddress, replacement: string): Planned | null {
    if (this.searchOpts.lookIn !== "notes") return this.cellReplacement(addr, replacement);
    const note = this.deps
      .sheet(addr.sheet)
      .notes?.find((entry) => entry.addr.row === addr.row && entry.addr.col === addr.col);
    return this.noteReplacement(addr, note?.text, replacement);
  }

  /**
   * The change that rewrites `addr` for the current query, or null when the
   * cell is not eligible (a reference, or a formula in a value search) or
   * holds no occurrence to replace. The cell keeps its style.
   */
  private cellReplacement(addr: CellAddress, replacement: string): Planned | null {
    if (this.deps.store.getRefTarget(addr) !== null) return null;
    const formula = this.deps.store.getFormula(addr);
    if (formula !== null) {
      return this.formulaReplacement(
        addr,
        replacement,
        formula,
        this.deps.store.getCell(addr).style,
      );
    }

    return this.replacementFromCell(addr, replacement, this.deps.store.getCell(addr));
  }

  /**
   * Rewrite a formula's text, as Excel's Replace does: null when the search
   * looks in values, when nothing in the text matches, or when the new text is
   * not a formula the engine can read. Text that no longer starts with `=` is
   * entered as a value.
   */
  private formulaReplacement(
    addr: CellAddress,
    replacement: string,
    source: string,
    style: ResolvedCell["style"],
  ): Planned | null {
    if (this.searchOpts.lookIn === "values") return null;
    const next = replaceInText(source, this.searchQuery, replacement, this.searchOpts);
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

  private replacementFromCell(
    addr: CellAddress,
    replacement: string,
    cell: Pick<ResolvedCell, "resolved" | "style">,
  ): Planned | null {
    const text = cellScalarToText(cell.resolved);
    const next = replaceInText(text, this.searchQuery, replacement, this.searchOpts);
    if (next === null) return null;
    return { change: { addr, kind: "value", before: text, after: next }, style: cell.style };
  }

  /** The sheet's place in the tab order. */
  private tabOf(sheet: SheetId): number {
    return this.deps.store.getWorkbook().sheets.findIndex((entry) => entry.id === sheet);
  }

  /**
   * Index of the first match after `prev` in search order: later on its sheet,
   * then on the next sheet in tab order, wrapping to 0.
   */
  private advanceAfter(prev: CellAddress): number {
    const found = this.found;
    if (found.length === 0) return -1;
    const byColumns = this.searchOpts.searchBy === "columns";
    const part = found.find(prev.sheet);
    if (part) {
      for (let index = 0; index < part.set.length; index++) {
        if (precedes(byColumns, prev.row, prev.col, part.set.rowAt(index), part.set.colAt(index)))
          return part.start + index;
      }
    }
    const tab = this.tabOf(prev.sheet);
    return found.sheets.find((entry) => entry.tab > tab)?.start ?? 0;
  }

  /**
   * The match a new search starts at: the first at or after the viewport's
   * top-left cell, in view order. Without one, a workbook search goes on to
   * the next sheet that has a match, as Excel's does, and a sheet search wraps
   * to its first match in view order.
   */
  private startIndex(): number {
    const found = this.found;
    const activeSheet = this.deps.activeSheet();
    const workbook = this.searchOpts.within === "workbook";
    const own = workbook ? found.find(activeSheet) : found.sheets[0];
    const viewport = own ? this.viewportMatches(own.set, this.deps.viewportAnchor()) : null;
    if (own && viewport && viewport.after >= 0) return own.start + viewport.after;
    if (workbook) {
      const tab = this.tabOf(activeSheet);
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
  private viewportMatches(
    matches: SearchMatchSet,
    anchor: { row: number; col: number },
  ): { after: number; first: number } {
    const byColumns = this.searchOpts.searchBy === "columns";
    let firstIndex = -1;
    let firstRow = Number.MAX_SAFE_INTEGER;
    let firstCol = Number.MAX_SAFE_INTEGER;
    let afterIndex = -1;
    let afterRow = Number.MAX_SAFE_INTEGER;
    let afterCol = Number.MAX_SAFE_INTEGER;

    for (let i = 0; i < matches.length; i++) {
      const viewRow = this.deps.toViewRow(matches.rowAt(i));
      if (viewRow === null) continue;
      const col = matches.colAt(i);
      if (precedes(byColumns, viewRow, col, firstRow, firstCol)) {
        firstIndex = i;
        firstRow = viewRow;
        firstCol = col;
      }
      const atOrAfter = !precedes(byColumns, viewRow, col, anchor.row, anchor.col);
      if (atOrAfter && precedes(byColumns, viewRow, col, afterRow, afterCol)) {
        afterIndex = i;
        afterRow = viewRow;
        afterCol = col;
      }
    }
    return { after: afterIndex, first: firstIndex };
  }

  /** Scan the searched sheet, or every visible sheet in tab order for a workbook search. */
  private scanAll(query: string, opts: SearchOptions): MatchList {
    const parts: Omit<SheetMatches, "start">[] = [];
    if (opts.within === "workbook") {
      for (const [tab, sheet] of this.deps.store.getWorkbook().sheets.entries()) {
        // Excel's Find skips hidden sheets.
        if ((sheet.visibility ?? "visible") !== "visible") continue;
        const set = this.scanMatches(sheet.id, query, opts);
        if (set.length > 0) parts.push({ sheet: sheet.id, tab, set });
      }
    } else {
      const sheet = opts.sheet ?? this.deps.activeSheet();
      const set = this.scanMatches(sheet, query, opts);
      if (set.length > 0) parts.push({ sheet, tab: this.tabOf(sheet), set });
    }
    return parts.length === 0 ? NO_MATCHES : new MatchList(parts);
  }

  /** Scan one sheet, keeping only matches inside the searched selection, in search order. */
  private scanMatches(sheetId: SheetId, query: string, opts: SearchOptions): SearchMatchSet {
    const scope = this.searchScope?.sheet === sheetId ? this.searchScope : null;
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
      ? this.scanNotes(sheetId, columns)
      : this.scanCells(sheetId, query, { ...opts, columns });
    if (scope) {
      const kept: number[] = [];
      for (let offset = 0; offset < pairs.length; offset += 2) {
        const row = pairs[offset] ?? 0;
        const col = pairs[offset + 1] ?? 0;
        if (this.inScope(sheetId, row, col)) kept.push(row, col);
      }
      pairs = Uint32Array.from(kept);
    }
    // Cell scans come back across each row; notes come in the order they were added.
    const byColumns = opts.searchBy === "columns";
    if (notes || byColumns) pairs = sortPairs(pairs, byColumns);
    return pairs.length === 0 ? EMPTY_MATCHES : new FlatSearchMatchSet(sheetId, pairs);
  }

  /** Whether a data cell lies in the searched selection; every cell does without one. */
  private inScope(sheet: SheetId, dataRow: number, col: number): boolean {
    const scope = this.searchScope;
    if (scope?.sheet !== sheet) return true;
    const viewRow = this.deps.toViewRow(dataRow);
    if (viewRow === null) return false;
    return scope.rects.some(
      (rect) => rect.r0 <= viewRow && viewRow <= rect.r1 && rect.c0 <= col && col <= rect.c1,
    );
  }

  /** `[row, col, ...]` pairs of the notes whose text matches, as Excel's Look in: Notes reads them. */
  private scanNotes(sheetId: SheetId, columns: readonly number[] | undefined): Uint32Array {
    const pairs: number[] = [];
    for (const note of this.deps.sheet(sheetId).notes ?? []) {
      if (columns && !columns.includes(note.addr.col)) continue;
      if (this.searchMatcher(note.text)) pairs.push(note.addr.row, note.addr.col);
    }
    return Uint32Array.from(pairs);
  }

  /** Row-major `[row, col, ...]` pairs of the cells whose text matches. */
  private scanCells(sheetId: SheetId, query: string, opts: SearchOptions): Uint32Array {
    const lookIn = opts.lookIn === "values" ? "values" : "formulas";
    // Fast path: scan the columnar store in WASM (no per-cell JS materialization).
    if (this.deps.loadable) {
      return this.deps.loadable.searchCellsFlat(sheetId, query, { ...opts, lookIn });
    }

    // Fallback for a non-SheetwriteStore store: bulk-read the sheet and scan in JS.
    const sheet = this.deps.sheet(sheetId);
    const cols = opts.columns ?? sheet.columns.map((_, i) => i);
    const matches = findMatcher(query, opts);
    const formulas = lookIn === "formulas";
    const pairs: number[] = [];
    if (sheet.rowCount === 0 || cols.length === 0) return new Uint32Array(0);

    // Matches are data addresses. A custom store's visible window can follow its
    // own sort or filter, so read canonical data rows when the store offers them.
    const rows = { start: 0, end: sheet.rowCount };
    const view =
      this.deps.store.getDataWindow?.(sheetId, rows, cols) ??
      this.deps.store.getVisibleWindow(sheetId, rows, cols);
    const n = cols.length;
    for (let r = 0; r < sheet.rowCount; r++) {
      for (let c = 0; c < n; c++) {
        const v = view.values[r * n + c];
        if (v === null || v === undefined || v === "") continue;
        const formula = formulas
          ? this.deps.store.getFormula({ sheet: sheetId, row: r, col: cols[c]! })
          : null;
        if (matches(formula ?? String(v))) {
          pairs.push(r, cols[c]!);
        }
      }
    }
    return Uint32Array.from(pairs);
  }

  /**
   * Select the active match and scroll to it, as Excel's Find Next does. In a
   * searched selection the active cell moves and the selection stays. A match
   * on another sheet of a workbook search shows that sheet, unless
   * `switchSheet` is false.
   */
  private revealActiveMatch(switchSheet = true): void {
    const match = this.found.at(this.searchActive);
    if (!match) return;
    if (match.sheet !== this.deps.activeSheet()) {
      if (!switchSheet || this.searchOpts.within !== "workbook") return;
      this.deps.activateSheet(match.sheet);
      if (match.sheet !== this.deps.activeSheet()) return;
    }

    const viewRow = this.deps.toViewRow(match.row);
    if (viewRow === null) return;

    const cell = { ...match, row: viewRow };
    if (this.searchScope?.sheet === match.sheet) this.deps.setActiveCell(cell);
    else this.deps.selectCell(cell);
    this.deps.scrollToCell(cell);
  }

  private emitSearch(): SearchResult {
    const result: SearchResult = {
      query: this.searchQuery,
      matches: this.found.materialize(),
      active: this.searchActive,
    };
    this.deps.emit(result);
    return result;
  }
}
