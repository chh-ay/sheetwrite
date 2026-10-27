---
title: Grid methods
description: The imperative Grid handle that createGrid returns, grouped by task.
---

`createGrid` returns an imperative `Grid` handle. Use it to read and change the document, the selection, the view and the layout.

```ts prelude="core" partial="requires an initialized grid with the item and cost rows described below" title="Drive the grid from code"
const sheet = grid.getActiveSheet();
grid.setSelection({ kind: "cell", addr: { sheet, row: 0, col: 1 } });
grid.sortBy(1, false);  // display-only sort, largest first
grid.setFrozen(1);      // pin the first view row
grid.setZoom(1.25);
console.log(grid.getZoom()); // 1.25
const off = grid.on("selection", ({ selection }) => console.log(selection));
// later
off();
```

<div class="sw-grid-result" data-caption="Result: costs are displayed largest first, with Desk at the top. The first view row is frozen and the live grid is zoomed to 125%.">

| Desk | 300 |
| --- | --- |
| Chair | 120 |
| Lamp | 40 |

</div>

<details>
<summary>Usage example (requires an initialized grid)</summary>

This API excerpt needs an initialized grid with a text item column and a numeric cost column. Use these data rows in order: Lamp / 40, Desk / 300, Chair / 120. There is no header row in the cell data.

```ts prelude="core" partial="requires surrounding host state" title="Drive the grid from code"
const sheet = grid.getActiveSheet();
grid.setSelection({ kind: "cell", addr: { sheet, row: 0, col: 1 } });
grid.sortBy(1, false);  // display-only sort, largest first
grid.setFrozen(1);      // pin the first view row
grid.setZoom(1.25);
console.log(grid.getZoom()); // 1.25
const off = grid.on("selection", ({ selection }) => console.log(selection));
// later
off();
```

</details>

The grid shows column B sorted from largest to smallest, the first row stays in place while the body scrolls, and content is drawn at 125%.

Each name in the tables links to its entry in the [`Grid` API reference](/docs/api/core/grid/). These are the signatures of the methods on this page:

```ts prelude="core" partial="interface excerpt; the API reference lists every member" title="Grid signatures"
interface Grid {
  readonly store: Store;
  readonly actions: GridActions;
  setActiveSheet(id: SheetId): void;
  scrollToCell(addr: CellAddress): void;
  getSelection(): Selection | null;
  setSelection(sel: Selection | null): void;
  setTheme(theme: Partial<Theme>): void;
  defineCellRenderer(name: string, renderer: CellRenderer): void;
  aggregate(col: number, op: AggregateOp): number;
  sortBy(col: number, ascending?: boolean): void;
  sortByMulti(keys: readonly SortKey[]): void;
  filterBy(col: number, needle: string): void;
  setColumnFilter(col: number, filter: ColumnFilter | null): void;
  getColumnFilters(): ReadonlyMap<number, ColumnFilter>;
  distinctValues(col: number, limit?: number): CellScalar[];
  hideRows(rows: readonly number[]): void;
  showRows(rows?: readonly number[]): void;
  hiddenRows(): readonly number[];
  hideColumns(cols?: readonly number[]): void;
  showColumns(cols?: readonly number[]): void;
  hiddenColumns(): readonly number[];
  groupRows(start: number, end: number): void;
  ungroupRows(start: number, end: number): void;
  setGroupCollapsed(start: number, collapsed: boolean): void;
  rowGroups(): readonly RowGroup[];
  clearView(): void;
  undo(): void;
  redo(): void;
  exportCsv(filename: string): void;
  exportXlsx(filename: string): Promise<void>;
  search(query: string, opts?: SearchOptions): SearchResult;
  findNext(): SearchResult;
  findPrev(): SearchResult;
  clearSearch(): void;
  replaceCurrent(replacement: string): SearchResult;
  replaceAll(replacement: string): ReplaceResult;
  insertRows(at: number, count?: number): void;
  removeRows(at: number, count?: number): void;
  insertColumns(at: number, count?: number): void;
  removeColumns(at: number, count?: number): void;
  highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void;
  styleRange(range: Range, style: Partial<CellStyle> | null): void;
  setValidationRule(rule: DataValidationRule): ApplyTransactionResult;
  removeValidationRule(id: string): ApplyTransactionResult;
  setProtectedRange(range: ProtectedRange): ApplyTransactionResult;
  removeProtectedRange(id: string): ApplyTransactionResult;
  setProtectionResolver(resolver?: ProtectionResolver, mode?: MutationPolicyMode): void;
  setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;
  getNote(addr: CellAddress): string | null;
  beginEdit(row: number, col: number, initial?: string, selectAll?: boolean): void;
  dataEdge(row: number, col: number, dRow: number, dCol: number): number | null;
  setRowHeight(row: number, height: number): void;
  setColumnWidth(col: number, width: number): void;
  autoFitRows(range?: Range): void;
  autoFitColumns(cols?: readonly number[]): void;
  setFrozen(rows: number, cols?: number): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void;
  refresh(): void;
  destroy(): void;
  // Also covered under "Other methods" below:
  applyTransaction(transaction: GridTransaction): ApplyTransactionResult;
  exportSnapshot(): WorkbookSnapshot;
  applyRemoteOperations(operations: readonly DocumentOp[], options?: RemoteOperationOptions): ApplyTransactionResult;
  getCommandState(command: GridCommandName): GridCommandState;
  getFocusCellStyle(): CellStyle;
  getCellAtPoint(clientX: number, clientY: number): CellAddress | null;
  setConfig(config: GridConfig | undefined): void;
  setReadOnly(readOnly: boolean): void;
}
```

## Document and sheets

| Method | Purpose |
| --- | --- |
| [`store`](/docs/api/core/grid/#grid-store) | The underlying [`Store`](/docs/concepts/runtime-ownership/#the-store-contract): apply transactions, read cells, subscribe. |
| [`actions`](/docs/api/core/grid/#grid-actions) | Imperative action surface (`toggleBold()`, `merge()`, `undo()`, `exportCsv()`, …) the toolbar and context menu bind to. Use it to wire custom controls. |
| [`setActiveSheet(id)`](/docs/api/core/grid/#grid-set-active-sheet) | Switch the visible sheet. |
| [`undo()`](/docs/api/core/grid/#grid-undo) / [`redo()`](/docs/api/core/grid/#grid-redo) | Undo or redo the last recorded cell edit (also bound to Ctrl+Z / Ctrl+Shift+Z). |
| [`insertRows(at, count?)`](/docs/api/core/grid/#grid-insert-rows) / `removeRows(at, count?)` / `insertColumns(at, count?)` / `removeColumns(at, count?)` | Structural edits through undoable patches. |
| [`styleRange(range, style)`](/docs/api/core/grid/#grid-style-range) | Merge or clear (`null`) store-backed cell styles across a range. |
| [`setValidationRule(rule)`](/docs/api/core/grid/#grid-set-validation-rule) / `removeValidationRule(id)` | Add, replace, or remove a serializable range validation rule. List and checkbox rules get accessible editors. |
| [`setProtectedRange(range)`](/docs/api/core/grid/#grid-set-protected-range) / `removeProtectedRange(id)` / `setProtectionResolver(resolver?, mode?)` | Define protected-range metadata and host-owned local permission policy. This is not server authorization. |
| [`setNote(addr, text)`](/docs/api/core/grid/#grid-set-note) / `getNote(addr)` | Set, clear (`null`), or read a serializable plain-text cell note. |
| [`exportCsv(filename)`](/docs/api/core/grid/#grid-export-csv) / `exportXlsx(filename)` | Download the active data; `exportXlsx` returns a promise. See [Data operations](/docs/import-export/xlsx-export/#errors-and-built-in-actions). |

## Selection, editing and search

| Method | Purpose |
| --- | --- |
| [`getSelection()`](/docs/api/core/grid/#grid-get-selection) / `setSelection(sel)` | Read or set the current [`Selection`](/docs/features/grid/selection-and-keyboard/#selection-model) (`null` clears it). |
| [`scrollToCell(addr)`](/docs/api/core/grid/#grid-scroll-to-cell) | Scroll a cell into view. |
| [`beginEdit(row, col, initial?, selectAll?)`](/docs/api/core/grid/#grid-begin-edit) | Open the inline editor at a view cell. |
| [`dataEdge(row, col, dRow, dCol)`](/docs/api/core/grid/#grid-data-edge) | Ctrl+Arrow-style data-run jump target, or `null`; vertical movement is view-aware under sort/filter. |
| [`search(query, opts?)`](/docs/api/core/grid/#grid-search) | Find matching cells; highlights them, emits `search`, returns a [`SearchResult`](/docs/features/grid/search/#options-and-result). |
| [`findNext()`](/docs/api/core/grid/#grid-find-next) / `findPrev()` | Step the active match forward / backward and scroll it into view. |
| [`clearSearch()`](/docs/api/core/grid/#grid-clear-search) | Drop the current search and clear its highlights. |
| [`replaceCurrent(replacement)`](/docs/api/core/grid/#grid-replace-current) / `replaceAll(replacement)` | Replace literal text/number matches through undoable transactions. |
| [`highlightCells(ranges, color?)`](/docs/api/core/grid/#grid-highlight-cells) | Highlight arbitrary ranges (`null` clears); `color` overrides the theme highlight. |

## Views: sort, filter, hide and group

| Method | Purpose |
| --- | --- |
| [`aggregate(col, op)`](/docs/api/core/grid/#grid-aggregate) | Column aggregate (returns a number); see [Data operations](/docs/features/data/data-operations/#aggregate). |
| [`sortBy(col, ascending?)`](/docs/api/core/grid/#grid-sort-by) / `sortByMulti(keys)` | Non-mutating display sorts; see [Data operations](/docs/features/data/data-operations/#display-views). |
| [`filterBy(col, needle)`](/docs/api/core/grid/#grid-filter-by) / `setColumnFilter(col, filter)` / `getColumnFilters()` | Column filters that compose with sort, hidden rows, and row groups. `setColumnFilter(col, null)` removes one. |
| [`distinctValues(col, limit?)`](/docs/api/core/grid/#grid-distinct-values) | First-seen distinct values for building filter menus. |
| [`hideRows(rows)`](/docs/api/core/grid/#grid-hide-rows) / `showRows(rows?)` / `hiddenRows()` | Explicit row visibility separate from sort/filter state. |
| [`hideColumns(cols?)`](/docs/api/core/grid/#grid-hide-columns) / `showColumns(cols?)` / `hiddenColumns()` | Bulk-safe persisted column visibility; omitted arguments target the focused column for hide and every column for show. |
| [`groupRows(start, end)`](/docs/api/core/grid/#grid-group-rows) / `ungroupRows(start, end)` / `setGroupCollapsed(start, collapsed)` / `rowGroups()` | Inclusive data-row groups with collapse state. |
| [`clearView()`](/docs/api/core/grid/#grid-clear-view) | Clears sort/filter state; hidden rows and row groups remain. |

## Layout and appearance

| Method | Purpose |
| --- | --- |
| [`setFrozen(rows, cols?)`](/docs/api/core/grid/#grid-set-frozen) | Pin leading view rows/columns while the body scrolls. |
| [`setZoom(z)`](/docs/api/core/grid/#grid-set-zoom) / `getZoom()` | Scale grid content between `0.5` and `2` without mutating workbook base sizes. |
| [`setRowHeight(row, h)`](/docs/api/core/grid/#grid-set-row-height) / `setColumnWidth(col, w)` | Geometry APIs; row height is view-indexed and persists against the underlying data row. |
| [`autoFitRows(range?)`](/docs/api/core/grid/#grid-auto-fit-rows) / `autoFitColumns(cols?)` | Explicit, undoable geometry fitting from bulk reads; auto-fit never runs during paint. |
| [`setTheme(partial)`](/docs/api/core/grid/#grid-set-theme) | Merge a partial theme and repaint. |
| [`defineCellRenderer(name, r)`](/docs/api/core/grid/#grid-define-cell-renderer) | Register a custom renderer after construction. See [Custom cell renderers](/docs/features/grid/options-and-presentation/#custom-cell-renderers). |

## Lifecycle

| Method | Purpose |
| --- | --- |
| [`on(evt, fn)`](/docs/api/core/grid/#grid-on) | Subscribe to an [event](/docs/reference/events/); returns an unsubscribe function. |
| [`refresh()`](/docs/api/core/grid/#grid-refresh) | Force a re-render, for example after mutating the workbook directly. |
| [`destroy()`](/docs/api/core/grid/#grid-destroy) | Tear down listeners, DOM, and ARIA attributes. |

## Other methods

| Method | Purpose |
| --- | --- |
| [`applyTransaction(transaction)`](/docs/api/core/grid/#grid-apply-transaction) | Apply arbitrary patches as one undoable grid commit. |
| [`exportSnapshot()`](/docs/api/core/grid/#grid-export-snapshot) / [`applyRemoteOperations(operations)`](/docs/api/core/grid/#grid-apply-remote-operations) | Export the complete document, or apply already-persisted operations. See [Persistence](/docs/features/data/persistence/#serializable-documents). |
| [`getCommandState(name)`](/docs/api/core/grid/#grid-get-command-state) | Undo/redo availability and formatting active/mixed/disabled state. See [Host-owned command state](/docs/features/grid/toolbar-and-ribbon/#host-owned-command-state). |
| [`getFocusCellStyle()`](/docs/api/core/grid/#grid-get-focus-cell-style) | Effective style of the focus cell: its own style over its column's `cellStyle`. |
| [`getCellAtPoint(clientX, clientY)`](/docs/api/core/grid/#grid-get-cell-at-point) | Resolve viewport coordinates to an active-sheet cell for [host-owned menus](/docs/features/grid/context-menu/#host-owned-menu). |
| [`setConfig(config)`](/docs/api/core/grid/#grid-set-config) / [`setReadOnly(readOnly)`](/docs/api/core/grid/#grid-set-read-only) | Reconfigure built-in chrome, or change editability, without replacing the grid. |

## Edge cases and limits

- Undo history keeps at most 200 entries. It also drops its oldest entries once retained range snapshots pass 256 MiB, about twenty million-cell clears. The newest entry always stays undoable.
- The 256 MiB policy counts engine-reported snapshot bytes, not total process memory. Cloned formula ASTs and JavaScript patch/redo payloads are bounded only by the 200-entry limit.
- Undo of a large clear restores the saved range directly from a packed engine snapshot.
- Display sorts and filters do not change the document. `clearView()` keeps hidden rows and row groups.

## See also

- [Grid options and presentation](/docs/features/grid/options-and-presentation/)
- [Events](/docs/reference/events/)
- [Search](/docs/features/grid/search/)
- [Toolbar and ribbon](/docs/features/grid/toolbar-and-ribbon/)
