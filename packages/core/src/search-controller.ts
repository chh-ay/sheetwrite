import { cellScalarToText, parseCellInput } from "./cell-input.js";
import { replaceInText } from "./search-replace.js";
import type { SheetwriteStore } from "./store.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar, CellValue } from "./types/cell.js";
import type { CellAddress, SheetId } from "./types/coordinates.js";
import type { DocumentOp, Sheet, SnapshotCell } from "./types/document.js";
import type { ReplaceResult, SearchOptions, SearchResult } from "./types/grid.js";
import type { ResolvedCell, Store } from "./types/store.js";

export interface SearchControllerDeps {
  store: Store;
  loadable: SheetwriteStore | null;
  activeSheet: () => SheetId;
  sheet: (id?: SheetId) => Sheet;
  toViewRow: (dataRow: number) => number | null;
  viewportAnchor: () => { row: number; col: number };
  scrollToCell: (addr: CellAddress) => void;
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
  private searchMatches: SearchMatchSet = EMPTY_MATCHES;
  private searchActive = -1;
  private searchQuery = "";
  private searchOpts: SearchOptions = {};
  private revision = 0;

  constructor(deps: SearchControllerDeps) {
    this.deps = deps;
  }

  get matches(): SearchMatchSet {
    return this.searchMatches;
  }

  get active(): number {
    return this.searchActive;
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
    if (
      independentCells &&
      activeSheet === this.searchMatches.sheet &&
      patches.every((patch) => this.preservesMatchMembership(patch, activeSheet))
    )
      return;
    const next = this.scanMatches(this.searchQuery, this.searchOpts);
    const previous = this.searchMatches;
    if (next.sheet === previous.sheet && next.length === previous.length) {
      let unchanged = true;
      for (let index = 0; index < next.length; index++) {
        if (
          next.rowAt(index) !== previous.rowAt(index) ||
          next.colAt(index) !== previous.colAt(index)
        ) {
          unchanged = false;
          break;
        }
      }
      // Retain the match identity and row index when only values changed.
      if (unchanged) return;
    }

    const active = previous.at(this.searchActive);
    this.searchMatches = next;
    this.searchActive = next.length > 0 ? 0 : -1;
    if (active) {
      for (let index = 0; index < next.length; index++) {
        if (next.rowAt(index) === active.row && next.colAt(index) === active.col) {
          this.searchActive = index;
          break;
        }
      }
    }
    this.revision += 1;
    this.emitSearch();
  }

  private preservesMatchMembership(patch: DocumentOp, sheet: SheetId): boolean {
    if (patch.op === "setNote" || patch.op === "setRangeStyle") return true;
    if (patch.op !== "set") return false;
    if (patch.addr.sheet !== sheet) return true;
    if (patch.value.kind !== "literal") return false;
    if (this.searchOpts.columns && !this.searchOpts.columns.includes(patch.addr.col)) return true;

    const text = engineSearchText(this.deps.store.getCell(patch.addr).resolved);
    if (text === null) return false;
    const caseFolded = !this.searchOpts.matchCase;
    if (caseFolded && (NON_ASCII.test(text) || NON_ASCII.test(this.searchQuery))) return false;
    const haystack = caseFolded ? text.toLowerCase() : text;
    const needle = caseFolded ? this.searchQuery.toLowerCase() : this.searchQuery;
    const matchesNow = this.searchOpts.wholeCell ? haystack === needle : haystack.includes(needle);
    const matches = this.searchMatches;
    let start = 0;
    let end = matches.length;
    while (start < end) {
      const middle = start + ((end - start) >>> 1);
      const row = matches.rowAt(middle);
      const col = matches.colAt(middle);
      if (row < patch.addr.row || (row === patch.addr.row && col < patch.addr.col))
        start = middle + 1;
      else end = middle;
    }
    const matchedBefore =
      matches.rowAt(start) === patch.addr.row && matches.colAt(start) === patch.addr.col;
    return matchesNow === matchedBefore;
  }

  search(query: string, opts: SearchOptions = {}): SearchResult {
    this.searchQuery = query;
    this.searchOpts = opts;
    this.searchMatches = query ? this.scanMatches(query, opts) : EMPTY_MATCHES;
    this.searchActive =
      this.searchMatches.length > 0
        ? this.activeFromViewport(this.searchMatches, this.deps.viewportAnchor())
        : -1;
    this.revision += 1;
    this.revealActiveMatch();
    this.deps.scheduleRender();
    return this.emitSearch();
  }

  findNext(): SearchResult {
    if (this.searchMatches.length > 0) {
      this.searchActive = (this.searchActive + 1) % this.searchMatches.length;
      this.revision += 1;
      this.revealActiveMatch();
      this.deps.scheduleRender();
    }
    return this.emitSearch();
  }

  findPrev(): SearchResult {
    if (this.searchMatches.length > 0) {
      const n = this.searchMatches.length;
      this.searchActive = (this.searchActive - 1 + n) % n;
      this.revision += 1;
      this.revealActiveMatch();
      this.deps.scheduleRender();
    }
    return this.emitSearch();
  }

  clearSearch(): void {
    this.searchQuery = "";
    this.searchMatches = EMPTY_MATCHES;
    this.searchActive = -1;
    this.revision += 1;
    this.deps.scheduleRender();
    this.emitSearch();
  }

  /**
   * Replace the active match, then advance to the next match after it (in
   * row-major order, wrapping). Formula/ref cells are skipped rather than
   * rewritten; the active pointer still advances so the caller is never stuck.
   */
  replaceCurrent(replacement: string): SearchResult {
    const target = this.searchMatches.at(this.searchActive);
    if (this.deps.readOnly() || !target) return this.emitSearch();

    const patch = this.replacementPatch(target, replacement);
    if (patch) {
      this.deps.commit([patch]);
      this.searchMatches = this.scanMatches(this.searchQuery, this.searchOpts);
    }
    this.searchActive = this.advanceAfter(target, this.searchMatches);
    this.revision += 1;
    this.revealActiveMatch();
    this.deps.scheduleRender();
    return this.emitSearch();
  }

  /**
   * Replace every current match in one transaction (a single undo step), then
   * re-scan. Skipped formula/ref cells are not counted.
   */
  replaceAll(replacement: string): ReplaceResult {
    if (this.deps.readOnly()) {
      return { replaced: 0, result: this.emitSearch() };
    }

    const patches: DocumentOp[] = [];
    let replaced = 0;
    const bySheet = new Map<SheetId, CellAddress[]>();
    for (let index = 0; index < this.searchMatches.length; index++) {
      const match = this.searchMatches.at(index);
      if (!match) continue;
      const matches = bySheet.get(match.sheet) ?? [];
      matches.push(match);
      bySheet.set(match.sheet, matches);
    }

    const engine = storeEngine(this.deps.store);
    for (const [sheet, matches] of bySheet) {
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
        const patch = cell
          ? cell.value.kind === "formula"
            ? null
            : this.replacementFromCell(addr, replacement, cell)
          : this.replacementPatch(addr, replacement);
        if (!patch) continue;
        if (scalarWrites) {
          patches.push(patch);
          replaced++;
          continue;
        }

        cells.push({
          rowOffset: addr.row,
          colOffset: addr.col,
          value: patch.value,
          style: patch.style,
        });
        endRow = Math.max(endRow, addr.row);
        endCol = Math.max(endCol, addr.col);
      }

      if (cells.length === 0) continue;
      replaced += cells.length;
      patches.push({
        op: "setRange",
        range: { sheet, start: { row: 0, col: 0 }, end: { row: endRow, col: endCol } },
        cells,
      });
    }

    if (patches.length > 0) {
      this.deps.commit(patches);
      this.searchMatches = this.scanMatches(this.searchQuery, this.searchOpts);
      this.searchActive = this.searchMatches.length > 0 ? 0 : -1;
      this.revision += 1;
      this.revealActiveMatch();
      this.deps.scheduleRender();
    }
    return { replaced, result: this.emitSearch() };
  }

  /**
   * Build a `set` patch that rewrites `addr` for the current query, or null when
   * the cell is not eligible (formula/ref) or holds no occurrence to replace.
   * Preserves the cell's existing style and re-parses through `parseCellInput`
   * so numbers stay numbers.
   */
  private replacementPatch(
    addr: CellAddress,
    replacement: string,
  ): Extract<DocumentOp, { op: "set" }> | null {
    // Formula source text must never be rewritten by a resolved-value search.
    if (this.deps.store.getFormula(addr) !== null) return null;

    return this.replacementFromCell(addr, replacement, this.deps.store.getCell(addr));
  }

  private replacementFromCell(
    addr: CellAddress,
    replacement: string,
    cell: Pick<ResolvedCell, "resolved" | "style">,
  ): Extract<DocumentOp, { op: "set" }> | null {
    const text = cellScalarToText(cell.resolved);
    const next = replaceInText(text, this.searchQuery, replacement, this.searchOpts);
    if (next === null) return null;

    const column = this.deps.sheet(addr.sheet).columns[addr.col];
    const value: CellValue = parseCellInput(next, column?.type ?? "text");
    return { op: "set", addr, value, style: cell.style };
  }

  /** Index of the first match ordered after `prev` (row-major), wrapping to 0. */
  private advanceAfter(prev: CellAddress, matches: SearchMatchSet): number {
    if (matches.length === 0) return -1;
    for (let i = 0; i < matches.length; i++) {
      const row = matches.rowAt(i);
      const col = matches.colAt(i);
      if (row > prev.row || (row === prev.row && col > prev.col)) return i;
    }
    return 0;
  }

  /**
   * Pick the first match at or after the viewport's top-left cell in current
   * view order. If no later match exists, wrap to the earliest visible-order
   * match. Search results stay in data space; sorted views are mapped here.
   */
  private activeFromViewport(
    matches: SearchMatchSet,
    anchor: { row: number; col: number },
  ): number {
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
      if (viewRow < firstRow || (viewRow === firstRow && col < firstCol)) {
        firstIndex = i;
        firstRow = viewRow;
        firstCol = col;
      }
      const atOrAfter = viewRow > anchor.row || (viewRow === anchor.row && col >= anchor.col);
      if (atOrAfter && (viewRow < afterRow || (viewRow === afterRow && col < afterCol))) {
        afterIndex = i;
        afterRow = viewRow;
        afterCol = col;
      }
    }
    return afterIndex >= 0 ? afterIndex : firstIndex;
  }

  private scanMatches(query: string, opts: SearchOptions): SearchMatchSet {
    const sheetId = opts.sheet ?? this.deps.activeSheet();

    // Fast path: scan the columnar store in WASM (no per-cell JS materialization).
    if (this.deps.loadable) {
      return new FlatSearchMatchSet(
        sheetId,
        this.deps.loadable.searchCellsFlat(sheetId, query, opts),
      );
    }

    // Fallback for a non-SheetwriteStore store: bulk-read the sheet and scan in JS.
    const sheet = this.deps.sheet(sheetId);
    const cols = opts.columns ?? sheet.columns.map((_, i) => i);
    const needle = opts.matchCase ? query : query.toLowerCase();
    const pairs: number[] = [];
    if (sheet.rowCount === 0 || cols.length === 0) return EMPTY_MATCHES;

    const view = this.deps.store.getVisibleWindow(sheetId, { start: 0, end: sheet.rowCount }, cols);
    const n = cols.length;
    for (let r = 0; r < sheet.rowCount; r++) {
      for (let c = 0; c < n; c++) {
        const v = view.values[r * n + c];
        if (v === null || v === undefined || v === "") continue;
        const text = opts.matchCase ? String(v) : String(v).toLowerCase();
        if (opts.wholeCell ? text === needle : text.includes(needle)) {
          pairs.push(r, cols[c]!);
        }
      }
    }
    return pairs.length === 0
      ? EMPTY_MATCHES
      : new FlatSearchMatchSet(sheetId, Uint32Array.from(pairs));
  }

  private revealActiveMatch(): void {
    const m = this.searchMatches.at(this.searchActive);
    if (!m || m.sheet !== this.deps.activeSheet()) return;

    const viewRow = this.deps.toViewRow(m.row);
    if (viewRow === null) return;

    this.deps.scrollToCell({ ...m, row: viewRow });
  }

  private emitSearch(): SearchResult {
    const result: SearchResult = {
      query: this.searchQuery,
      matches: this.searchMatches.materialize(),
      active: this.searchActive,
    };
    this.deps.emit(result);
    return result;
  }
}
