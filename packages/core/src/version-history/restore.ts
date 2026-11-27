import { isDashboard } from "../dashboard.js";
import { DEFAULT_CALCULATION_SETTINGS } from "../document-protocol.js";
import type { SheetwriteStore } from "../store.js";
import { storeEngine } from "../store/engine-registry.js";
import type { SyncCoordinator } from "../sync.js";
import type { CellHyperlink } from "../types/cell.js";
import type { MergeRange, Range, SheetId } from "../types/coordinates.js";
import type {
  CellNote,
  DocumentOp,
  NamedRangeSnapshot,
  RowMetadata,
  Sheet,
  SheetSnapshot,
  Workbook,
  WorkbookSnapshot,
} from "../types/document.js";
import type { Store } from "../types/store.js";
import { HistoryError } from "./codec.js";
import type { HistoryDiffRequest } from "./diff.js";
import type { RowComparer } from "./row-compare.js";

/** Cells captured per restore block: large enough to amortize capture, small enough to band. */
const BAND_CELLS = 65_536;

/**
 * Changed rows this close share one rewritten band: one clear and one block
 * write cost more than writing a few unchanged rows again.
 */
const BAND_GAP_ROWS = 16;

/**
 * The parts of `rect` on `sheet` whose live cells can differ from the
 * historical ones in source or style; `undefined` to rewrite all of `rect`.
 */
type CellRewrite = (sheet: SheetId, rect: Rect) => readonly Rect[] | undefined;

/** Rewrite every cell of the scope, as when the live cells cannot be compared. */
const REWRITE_ALL: CellRewrite = () => undefined;

/** What a restore covers. */
export type HistoryRestoreScope =
  | { kind: "workbook" }
  | { kind: "sheet"; sheet: SheetId }
  | { kind: "range"; range: Range };

/** Options for `HistoryArchive.restoreVersion`. */
export interface HistoryRestoreOptions {
  /** The grid's coordinator in a shared document; the restore then needs an idle queue. */
  sync?: SyncCoordinator;
  /** Stops the restore before it changes the grid; the call then rejects. */
  signal?: AbortSignal;
  /**
   * Where the history kernel WASM comes from, as `HistoryDiffRequest.kernel`.
   * The restore compares the live cells with the version's on it, so it
   * writes only the rows that differ.
   */
  kernel?: HistoryDiffRequest["kernel"];
}

/**
 * Operations grouped by phase. Phases apply in declaration order, so every
 * operation is valid at its point: objects are removed before the sheet
 * changes size, and added after its cells are written.
 */
interface RestorePlan {
  removals: DocumentOp[];
  sheets: DocumentOp[];
  structure: DocumentOp[];
  names: DocumentOp[];
  content: DocumentOp[];
  additions: DocumentOp[];
  visibility: DocumentOp[];
  /** Sheets whose last rows or columns the restore removes. */
  shrinking: Set<SheetId>;
}

/** A rectangle of cells, inclusive. */
export interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

function empty_plan(): RestorePlan {
  return {
    removals: [],
    sheets: [],
    structure: [],
    names: [],
    content: [],
    additions: [],
    visibility: [],
    shrinking: new Set(),
  };
}

/**
 * Current sources of formulas and references on other sheets that point at a
 * sheet whose tail the restore removes. The removal turns them into `#REF!`,
 * as a manual delete does; the restore's undo sets these sources again after
 * the rows come back.
 */
function reference_guards(
  live: Store,
  current: Workbook,
  shrinking: ReadonlySet<SheetId>,
): DocumentOp[] {
  const engine = storeEngine(live);
  if (!engine || shrinking.size === 0) {
    return [];
  }

  const names = current.sheets
    .filter((sheet) => shrinking.has(sheet.id))
    .map((sheet) => sheet.name.toLowerCase());

  const guards: DocumentOp[] = [];
  for (const sheet of current.sheets) {
    if (shrinking.has(sheet.id)) {
      continue;
    }

    const sources = engine.captureSheetSources(sheet.id);
    if (!sources) {
      continue;
    }

    const offsets = new Set<number>();
    sources.formulaOffsets.forEach((offset, index) => {
      const source = sources.formulaSources[index]?.toLowerCase() ?? "";
      if (names.some((name) => source.includes(name))) {
        offsets.add(offset);
      }
    });

    for (const offset of sources.referenceOffsets) {
      const target = sources.referenceAt(offset);
      if (target && shrinking.has(target.sheet)) {
        offsets.add(offset);
      }
    }

    const width = sheet.columns.length;
    const addresses = [...offsets]
      .sort((left, right) => left - right)
      .map((offset) => ({ row: Math.floor(offset / width), col: offset % width }));
    const cells = engine.captureCells(sheet.id, addresses);

    addresses.forEach((address, index) => {
      const cell = cells[index];
      if (cell) {
        guards.push({
          op: "set",
          addr: { sheet: sheet.id, ...address },
          value: cell.value,
          style: cell.style,
        });
      }
    });
  }

  return guards;
}

function flatten(plan: RestorePlan): DocumentOp[] {
  return [
    ...plan.removals,
    ...plan.sheets,
    ...plan.structure,
    ...plan.names,
    ...plan.content,
    ...plan.additions,
    ...plan.visibility,
  ];
}

function invalid_scope(message: string): HistoryError {
  return new HistoryError("invalid-scope", message);
}

/** A shared document restores only from its synchronized head. */
export function assertIdle(sync: SyncCoordinator | undefined): void {
  if (!sync) {
    return;
  }

  const state = sync.state;
  const idle =
    state.connection === "online" && state.activity === "idle" && state.pendingCount === 0;

  if (!idle) {
    throw new HistoryError(
      "conflict",
      "Restore needs a synchronized document with no pending or conflicted edits",
    );
  }
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function range_rect(range: Range): Rect {
  return {
    r0: Math.min(range.start.row, range.end.row),
    c0: Math.min(range.start.col, range.end.col),
    r1: Math.max(range.start.row, range.end.row),
    c1: Math.max(range.start.col, range.end.col),
  };
}

function merge_rect(merge: MergeRange): Rect {
  return { r0: merge.r0, c0: merge.c0, r1: merge.r1, c1: merge.c1 };
}

function rect_range(sheet: SheetId, rect: Rect): Range {
  return {
    sheet,
    start: { row: rect.r0, col: rect.c0 },
    end: { row: rect.r1, col: rect.c1 },
  };
}

function intersection(left: Rect, right: Rect): Rect | undefined {
  const rect = {
    r0: Math.max(left.r0, right.r0),
    c0: Math.max(left.c0, right.c0),
    r1: Math.min(left.r1, right.r1),
    c1: Math.min(left.c1, right.c1),
  };

  return rect.r0 <= rect.r1 && rect.c0 <= rect.c1 ? rect : undefined;
}

function intersects(left: Rect, right: Rect): boolean {
  return left.r0 <= right.r1 && right.r0 <= left.r1 && left.c0 <= right.c1 && right.c0 <= left.c1;
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    outer.r0 <= inner.r0 && inner.r1 <= outer.r1 && outer.c0 <= inner.c0 && inner.c1 <= outer.c1
  );
}

function cell_inside(rect: Rect, row: number, col: number): boolean {
  return row >= rect.r0 && row <= rect.r1 && col >= rect.c0 && col <= rect.c1;
}

/** Sorted rows of `rect` that hold a historical cell. */
function occupied_rows(sheet: SheetSnapshot, rect: Rect): number[] {
  const rows = new Set<number>();

  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      const row = block.startRow + cell.rowOffset;
      const col = block.startCol + cell.colOffset;
      if (cell_inside(rect, row, col)) {
        rows.add(row);
      }
    }
  }

  return [...rows].sort((left, right) => left - right);
}

/**
 * Historical cells of `rect` as `setBlock` operations, captured in row bands
 * over `rows`, the sorted rows of `rect` that hold cells, so a sparse sheet
 * does not produce blocks of empty rows. The capture is the engine's undo
 * capture: formula sources, references and styles come back exactly.
 */
function cell_bands(
  store: SheetwriteStore,
  sheet: SheetId,
  rect: Rect,
  rows: readonly number[],
): DocumentOp[] {
  const width = rect.c1 - rect.c0 + 1;
  const band_rows = Math.max(1, Math.floor(BAND_CELLS / width));

  const operations: DocumentOp[] = [];
  let index = 0;

  while (index < rows.length) {
    const start = rows[index] ?? 0;
    let end = start;

    while (index < rows.length && (rows[index] ?? 0) - start < band_rows) {
      end = rows[index] ?? end;
      index++;
    }

    const range = rect_range(sheet, { r0: start, c0: rect.c0, r1: end, c1: rect.c1 });
    const capture = store.captureRangeHistory(range);
    if (!capture) {
      throw new HistoryError("integrity", "Historical cells could not be read");
    }

    try {
      operations.push(capture.toDocumentOp(range));
    } finally {
      capture.dispose();
    }
  }

  return operations;
}

/** First index of `rows` (sorted) at or after `row`. */
function lower_bound(rows: readonly number[], row: number): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((rows[middle] ?? 0) < row) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

/**
 * Bands of `rect` around `rows`, the sorted rows that differ: rows closer than
 * `BAND_GAP_ROWS` share one band, so scattered edits make few operations and
 * a large change makes one band.
 */
function differing_bands(rect: Rect, rows: readonly number[]): Rect[] {
  const bands: Rect[] = [];
  for (const row of rows) {
    const last = bands[bands.length - 1];
    if (last && row - last.r1 <= BAND_GAP_ROWS) {
      last.r1 = row;
    } else {
      bands.push({ r0: row, c0: rect.c0, r1: row, c1: rect.c1 });
    }
  }

  return bands;
}

/**
 * Clear and write again the historical cells of `rect`: the whole rectangle,
 * or only the parts that `rewrite` says can differ from the live cells. Cells
 * outside those parts already hold the historical sources and styles.
 */
function rewrite_cells(
  plan: RestorePlan,
  store: SheetwriteStore,
  historical: SheetSnapshot,
  rect: Rect,
  rewrite: CellRewrite,
): void {
  const id = historical.id;
  const bands = rewrite(id, rect) ?? [rect];
  const occupied = occupied_rows(historical, rect);

  for (const band of bands) {
    plan.content.push({
      op: "clearRange",
      range: rect_range(id, band),
      contents: true,
      style: true,
    });
    const rows = occupied.slice(lower_bound(occupied, band.r0), lower_bound(occupied, band.r1 + 1));
    plan.content.push(...cell_bands(store, id, band, rows));
  }
}

function current_row_meta(sheet: Sheet): number[] {
  const rows = new Set<number>([...(sheet.rowHeights?.keys() ?? []), ...(sheet.hiddenRows ?? [])]);
  return [...rows];
}

function note_key(note: CellNote): string {
  return `${note.addr.row}:${note.addr.col}`;
}

/**
 * Note changes inside `rect`. `clear` removes each current note that the
 * version does not have with the same text. `set` writes each historical note
 * that the current notes do not have with the same text.
 */
function note_operations(
  sheet: SheetId,
  current: readonly CellNote[],
  historical: readonly CellNote[],
  rect: Rect,
): { clear: DocumentOp[]; set: DocumentOp[] } {
  const inside = (note: CellNote) => cell_inside(rect, note.addr.row, note.addr.col);
  const kept = new Map(historical.filter(inside).map((note) => [note_key(note), note]));

  const clear: DocumentOp[] = [];
  for (const note of current.filter(inside)) {
    if (kept.get(note_key(note))?.text !== note.text) {
      clear.push({ op: "setNote", addr: { ...note.addr, sheet }, text: null });
    }
  }

  const set: DocumentOp[] = [];
  const current_by_key = new Map(current.filter(inside).map((note) => [note_key(note), note]));
  for (const note of kept.values()) {
    if (current_by_key.get(note_key(note))?.text !== note.text) {
      set.push({ op: "setNote", addr: { ...note.addr, sheet }, text: note.text });
    }
  }

  return { clear, set };
}

function row_meta_of(sheet: Sheet, row: number): RowMetadata | null {
  const height = sheet.rowHeights?.get(row);
  const hidden = sheet.hiddenRows?.has(row) ?? false;
  if (height === undefined && !hidden) {
    return null;
  }

  return { ...(height !== undefined ? { height } : {}), ...(hidden ? { hidden } : {}) };
}

/**
 * Remove, add or replace the keyed objects of a sheet (such as tables, charts,
 * pivots and rules), so they match the historical ones.
 */
function keyed_objects<T extends { id: string }>(
  current: readonly T[],
  historical: readonly T[],
  remove: (id: string) => DocumentOp,
  set: (item: T, existed: boolean) => DocumentOp,
  plan: RestorePlan,
): void {
  const historical_ids = new Set(historical.map((item) => item.id));
  const current_by_id = new Map(current.map((item) => [item.id, item]));

  for (const item of current) {
    if (!historical_ids.has(item.id)) {
      plan.removals.push(remove(item.id));
    }
  }

  for (const item of historical) {
    const existing = current_by_id.get(item.id);
    if (!existing || !same(existing, item)) {
      plan.additions.push(set(item, existing !== undefined));
    }
  }
}

/**
 * Bring a dashboard to its historical items and pivots in place. It has no
 * cells, rows, columns or sheet formats to restore.
 */
function plan_dashboard_in_place(
  current: Sheet,
  historical: SheetSnapshot,
  plan: RestorePlan,
): void {
  const id = current.id;

  keyed_objects(
    current.pivots ?? [],
    historical.pivots ?? [],
    (pivot_id) => ({ op: "removePivot", sheet: id, id: pivot_id }),
    (pivot) => ({ op: "setPivot", sheet: id, pivot }),
    plan,
  );

  keyed_objects(
    current.dashboard?.items ?? [],
    historical.dashboard?.items ?? [],
    (item_id) => ({ op: "removeDashboardItem", sheet: id, id: item_id }),
    (item) => ({ op: "setDashboardItem", sheet: id, item }),
    plan,
  );

  const visibility = historical.visibility ?? "visible";
  if ((current.visibility ?? "visible") !== visibility) {
    plan.visibility.push({ op: "setSheetVisibility", sheet: id, visibility });
  }
}

/**
 * Bring an existing sheet to its historical state in place, keeping its ID,
 * so formulas on other sheets keep their references. Rows and columns change
 * only at the end.
 */
function plan_sheet_in_place(
  current: Sheet,
  historical: SheetSnapshot,
  store: SheetwriteStore,
  plan: RestorePlan,
  rewrite: CellRewrite,
): void {
  const id = current.id;

  // A sheet keeps its kind for its whole life, so only a removed and re-added sheet can differ.
  if (isDashboard(current) !== isDashboard(historical)) {
    throw invalid_scope(
      `Sheet ${current.name} changed between a worksheet and a dashboard since this version`,
    );
  }
  if (isDashboard(current)) {
    plan_dashboard_in_place(current, historical, plan);
    return;
  }

  for (const merge of current.merges ?? []) {
    plan.removals.push({ op: "removeMerge", sheet: id, merge });
  }

  keyed_objects(
    current.validationRules ?? [],
    historical.validationRules ?? [],
    (rule_id) => ({ op: "removeValidationRule", sheet: id, id: rule_id }),
    (rule) => ({ op: "setValidationRule", sheet: id, rule }),
    plan,
  );

  keyed_objects(
    current.hyperlinks ?? [],
    historical.hyperlinks ?? [],
    (link_id) => ({ op: "removeHyperlink", sheet: id, id: link_id }),
    (hyperlink) => ({ op: "setHyperlink", sheet: id, hyperlink }),
    plan,
  );

  keyed_objects(
    current.protectedRanges ?? [],
    historical.protectedRanges ?? [],
    (range_id) => ({ op: "removeProtectedRange", sheet: id, id: range_id }),
    (protected_range) => ({ op: "setProtectedRange", sheet: id, protectedRange: protected_range }),
    plan,
  );

  keyed_objects(
    current.charts ?? [],
    historical.charts ?? [],
    (chart_id) => ({ op: "removeChart", sheet: id, id: chart_id }),
    (chart) => ({ op: "setChart", sheet: id, chart }),
    plan,
  );

  keyed_objects(
    current.pivots ?? [],
    historical.pivots ?? [],
    (pivot_id) => ({ op: "removePivot", sheet: id, id: pivot_id }),
    (pivot) => ({ op: "setPivot", sheet: id, pivot }),
    plan,
  );

  keyed_objects(
    current.tables ?? [],
    historical.tables ?? [],
    (table_id) => ({ op: "removeTable", sheet: id, tableId: table_id }),
    (table, existed) =>
      existed
        ? {
            op: "updateTable",
            sheet: id,
            tableId: table.id,
            patch: {
              name: table.name,
              range: table.range,
              columns: table.columns,
              headerRow: table.headerRow,
              totalsRow: table.totalsRow,
              style: table.style ?? null,
              autoFilter: table.autoFilter ?? null,
              sortState: table.sortState ?? null,
              unsupportedFeatures: table.unsupportedFeatures ?? [],
            },
          }
        : { op: "addTable", table },
    plan,
  );

  if (historical.rowCount > current.rowCount) {
    plan.structure.push({
      op: "addRows",
      sheet: id,
      at: current.rowCount,
      count: historical.rowCount - current.rowCount,
    });
  } else if (historical.rowCount < current.rowCount) {
    plan.shrinking.add(id);
    plan.structure.push({
      op: "removeRows",
      sheet: id,
      at: historical.rowCount,
      count: current.rowCount - historical.rowCount,
    });
  }

  const shared_columns = Math.min(current.columns.length, historical.columns.length);
  if (historical.columns.length < current.columns.length) {
    plan.shrinking.add(id);
    plan.structure.push({
      op: "removeColumns",
      sheet: id,
      at: historical.columns.length,
      count: current.columns.length - historical.columns.length,
    });
  }

  for (let col = 0; col < shared_columns; col++) {
    const column = historical.columns[col];
    if (column && !same(current.columns[col], column)) {
      plan.structure.push({ op: "setColumn", sheet: id, col, patch: { ...column } });
    }
  }

  if (historical.columns.length > current.columns.length) {
    plan.structure.push({
      op: "addColumns",
      sheet: id,
      at: current.columns.length,
      columns: historical.columns.slice(current.columns.length),
    });
  }

  // Cells: clear the restored extent, or the rows of it that differ, then
  // write the historical cells. A sheet that changes size or columns is
  // rewritten whole, so its cells follow the new shape.
  const extent: Rect = {
    r0: 0,
    c0: 0,
    r1: historical.rowCount - 1,
    c1: historical.columns.length - 1,
  };

  if (historical.rowCount > 0) {
    const notes = note_operations(id, current.notes ?? [], historical.notes ?? [], extent);
    plan.content.push(...notes.clear);
    const same_shape =
      current.rowCount === historical.rowCount && same(current.columns, historical.columns);
    rewrite_cells(plan, store, historical, extent, same_shape ? rewrite : REWRITE_ALL);
    plan.content.push(...notes.set);
  }

  // Sheet metadata after the cells, so merges and rules see their final cells.
  plan.additions.push({
    op: "setSheetMeta",
    sheet: id,
    patch: {
      frozenRows: historical.frozenRows ?? 0,
      frozenCols: historical.frozenCols ?? 0,
      conditionalFormats: historical.conditionalFormats ?? [],
      rowGroups: historical.rowGroups ?? [],
      sortKeys: historical.sortKeys ?? [],
      filters: historical.filters ?? [],
      autoFilter: historical.autoFilter ?? null,
      tabColor: historical.tabColor ?? null,
    },
  });

  const historical_meta = new Map(historical.rowMeta ?? []);
  for (const row of current_row_meta(current)) {
    if (row < historical.rowCount && !historical_meta.has(row)) {
      plan.additions.push({ op: "setRowMeta", sheet: id, row, meta: null });
    }
  }

  for (const [row, meta] of historical_meta) {
    if (!same(row_meta_of(current, row), meta)) {
      plan.additions.push({ op: "setRowMeta", sheet: id, row, meta });
    }
  }

  for (const merge of historical.merges ?? []) {
    plan.additions.push({ op: "addMerge", sheet: id, merge });
  }

  const visibility = historical.visibility ?? "visible";
  if ((current.visibility ?? "visible") !== visibility) {
    plan.visibility.push({ op: "setSheetVisibility", sheet: id, visibility });
  }
}

/** Restore one sheet; a sheet removed since the version comes back with its ID. */
function plan_sheet(
  current: Workbook,
  historical: WorkbookSnapshot,
  store: SheetwriteStore,
  sheet_id: SheetId,
  rewrite: CellRewrite,
): RestorePlan {
  const target = historical.sheets.find((sheet) => sheet.id === sheet_id);
  if (!target) {
    throw invalid_scope(`Sheet ${sheet_id} did not exist in this version`);
  }

  const plan = empty_plan();
  const owner = current.sheets.find(
    (sheet) => sheet.name.toLowerCase() === target.name.toLowerCase(),
  );
  if (owner && owner.id !== sheet_id) {
    throw invalid_scope(`Another sheet is named ${target.name}; rename it before restoring`);
  }

  const live = current.sheets.find((sheet) => sheet.id === sheet_id);
  if (!live) {
    plan.sheets.push({
      op: "addSheet",
      sheet: { ...target, order: Math.min(target.order, current.sheets.length) },
    });

    return plan;
  }

  if (live.name !== target.name) {
    plan.sheets.push({ op: "renameSheet", sheet: sheet_id, name: target.name });
  }

  plan_sheet_in_place(live, target, store, plan, rewrite);

  return plan;
}

function name_key(name: NamedRangeSnapshot | { name: string; scope?: SheetId }): string {
  return `${name.scope ?? ""}\u0000${name.name.toLowerCase()}`;
}

/** Restore every sheet, their order, workbook names, relationships and calculation options. */
function plan_workbook(
  current: Workbook,
  historical: WorkbookSnapshot,
  store: SheetwriteStore,
  rewrite: CellRewrite,
): RestorePlan {
  const plan = empty_plan();
  const historical_ids = new Set(historical.sheets.map((sheet) => sheet.id));
  const current_ids = new Set(current.sheets.map((sheet) => sheet.id));
  const historical_names = new Set(historical.sheets.map((sheet) => sheet.name.toLowerCase()));

  // Relationships name tables, so they go before tables and come back after them.
  const historical_relationships = historical.workbook.dataModel?.relationships ?? [];
  const relationship_ids = new Set(historical_relationships.map((relationship) => relationship.id));
  for (const relationship of current.dataModel?.relationships ?? []) {
    if (!relationship_ids.has(relationship.id)) {
      plan.removals.push({ op: "removeRelationship", id: relationship.id });
    }
  }

  // Measure names are unique, so removed measures leave before others take their names.
  const historical_measures = historical.workbook.dataModel?.measures ?? [];
  const measure_ids = new Set(historical_measures.map((measure) => measure.id));
  for (const measure of current.dataModel?.measures ?? []) {
    if (!measure_ids.has(measure.id)) {
      plan.removals.push({ op: "removeMeasure", id: measure.id });
    }
  }

  // A current sheet holding a name that another sheet takes back moves to a free name first.
  let free = 1;
  const taken = new Set([
    ...historical_names,
    ...current.sheets.map((sheet) => sheet.name.toLowerCase()),
  ]);
  for (const sheet of current.sheets) {
    const target = historical.sheets.find((candidate) => candidate.id === sheet.id);
    const moves = target === undefined || target.name !== sheet.name;
    if (moves && historical_names.has(sheet.name.toLowerCase())) {
      while (taken.has(`restore ${free}`)) {
        free++;
      }

      const name = `Restore ${free}`;
      taken.add(name.toLowerCase());
      plan.sheets.push({ op: "renameSheet", sheet: sheet.id, name });
    }
  }

  for (const target of historical.sheets) {
    if (!current_ids.has(target.id)) {
      plan.sheets.push({
        op: "addSheet",
        sheet: { ...target, order: current.sheets.length },
      });
    }
  }

  for (const sheet of current.sheets) {
    if (!historical_ids.has(sheet.id)) {
      plan.sheets.push({ op: "removeSheet", sheet: sheet.id });
    }
  }

  for (const target of historical.sheets) {
    const live = current.sheets.find((sheet) => sheet.id === target.id);
    if (live && live.name !== target.name) {
      plan.sheets.push({ op: "renameSheet", sheet: target.id, name: target.name });
    }
  }

  historical.sheets.forEach((target, index) => {
    plan.sheets.push({ op: "moveSheet", sheet: target.id, to: index });
  });

  for (const target of historical.sheets) {
    const live = current.sheets.find((sheet) => sheet.id === target.id);
    if (live) {
      plan_sheet_in_place(live, target, store, plan, rewrite);
    }
  }

  const historical_names_by_key = new Map(
    (historical.workbook.namedRanges ?? []).map((name) => [name_key(name), name]),
  );
  for (const name of current.namedRanges ?? []) {
    if (!historical_names_by_key.has(name_key(name))) {
      plan.removals.push({
        op: "removeNamedRange",
        name: name.name,
        ...(name.scope !== undefined ? { scope: name.scope } : {}),
      });
    }
  }

  const current_names = new Map((current.namedRanges ?? []).map((name) => [name_key(name), name]));
  for (const [key, name] of historical_names_by_key) {
    if (!same(current_names.get(key), name)) {
      plan.names.push({ op: "setNamedRange", namedRange: name });
    }
  }

  const current_relationships = new Map(
    (current.dataModel?.relationships ?? []).map((relationship) => [relationship.id, relationship]),
  );
  for (const relationship of historical_relationships) {
    if (!same(current_relationships.get(relationship.id), relationship)) {
      plan.additions.push({ op: "setRelationship", relationship });
    }
  }

  const current_measures = new Map(
    (current.dataModel?.measures ?? []).map((measure) => [measure.id, measure]),
  );
  for (const measure of historical_measures) {
    if (!same(current_measures.get(measure.id), measure)) {
      plan.additions.push({ op: "setMeasure", measure });
    }
  }

  const links = historical.workbook.externalLinks ?? [];
  if (!same(current.externalLinks ?? [], links)) {
    plan.additions.push({ op: "setExternalLinks", links: structuredClone(links) });
  }

  const calculation = historical.workbook.calculation ?? DEFAULT_CALCULATION_SETTINGS;
  if (!same(current.calculation ?? DEFAULT_CALCULATION_SETTINGS, calculation)) {
    plan.additions.push({ op: "setCalculation", calculation: { ...calculation } });
  }

  // Show sheets before hiding others, so one sheet stays visible throughout.
  plan.visibility.sort((left, right) => {
    const shown = (operation: DocumentOp) =>
      operation.op === "setSheetVisibility" && operation.visibility === "visible" ? 0 : 1;
    return shown(left) - shown(right);
  });

  return plan;
}

/** Reject a range restore that would cut a current or historical merge or hyperlink. */
function assert_whole(rect: Rect, objects: ReadonlyArray<{ rect: Rect; label: string }>): void {
  for (const object of objects) {
    if (intersects(rect, object.rect) && !contains(rect, object.rect)) {
      const { r0, c0, r1, c1 } = object.rect;
      throw invalid_scope(
        `The range cuts a ${object.label} at rows ${r0 + 1}-${r1 + 1}, columns ${c0 + 1}-${c1 + 1}; widen the range to include it`,
      );
    }
  }
}

/**
 * Restore cells, styles, notes, merges and hyperlinks inside one range of a
 * sheet. Sheet dimensions, rules, tables, charts, pivots and workbook names
 * stay current.
 */
function plan_range(
  current: Workbook,
  historical: WorkbookSnapshot,
  store: SheetwriteStore,
  range: Range,
  rewrite: CellRewrite,
): RestorePlan {
  const live = current.sheets.find((sheet) => sheet.id === range.sheet);
  const target = historical.sheets.find((sheet) => sheet.id === range.sheet);
  if (!live || !target) {
    throw invalid_scope("The range's sheet must exist now and in this version");
  }

  const rect = range_rect(range);
  const fits = (rows: number, cols: number) =>
    rect.r0 >= 0 && rect.c0 >= 0 && rect.r1 < rows && rect.c1 < cols;
  if (!fits(live.rowCount, live.columns.length) || !fits(target.rowCount, target.columns.length)) {
    throw invalid_scope("The range must lie inside the sheet now and in this version");
  }

  const merges = (items: readonly MergeRange[] | undefined) =>
    (items ?? []).map((merge) => ({ rect: merge_rect(merge), label: "merged cell", merge }));
  const links = (items: readonly CellHyperlink[] | undefined) =>
    (items ?? []).map((hyperlink) => ({
      rect: range_rect(hyperlink.range),
      label: "hyperlink",
      hyperlink,
    }));

  const current_merges = merges(live.merges);
  const historical_merges = merges(target.merges);
  const current_links = links(live.hyperlinks);
  const historical_links = links(target.hyperlinks);
  assert_whole(rect, [
    ...current_merges,
    ...historical_merges,
    ...current_links,
    ...historical_links,
  ]);

  const plan = empty_plan();
  const id = range.sheet;

  for (const { rect: area, merge } of current_merges) {
    if (contains(rect, area)) {
      plan.removals.push({ op: "removeMerge", sheet: id, merge });
    }
  }

  for (const { rect: area, hyperlink } of current_links) {
    if (contains(rect, area)) {
      plan.removals.push({ op: "removeHyperlink", sheet: id, id: hyperlink.id });
    }
  }

  const notes = note_operations(id, live.notes ?? [], target.notes ?? [], rect);
  plan.content.push(...notes.clear);
  rewrite_cells(plan, store, target, rect, rewrite);
  plan.content.push(...notes.set);

  for (const { rect: area, merge } of historical_merges) {
    if (contains(rect, area)) {
      plan.additions.push({ op: "addMerge", sheet: id, merge });
    }
  }

  for (const { rect: area, hyperlink } of historical_links) {
    if (contains(rect, area)) {
      plan.additions.push({ op: "setHyperlink", sheet: id, hyperlink });
    }
  }

  return plan;
}

/** A restore: the forward operations and the sources its undo sets last. */
export interface RestoreCommit {
  operations: DocumentOp[];
  guards: DocumentOp[];
}

/**
 * Whether the scope's cells can be compared with the live cells and only the
 * rows that differ rewritten. Removed, added or renamed sheets, a sheet that
 * loses rows or columns, and changed tables, pivots or table relationships
 * can rewrite formula sources outside their own cells, so the restore then
 * rewrites every cell of the scope, after them, from the version.
 */
function cells_restore_alone(
  current: Workbook,
  historical: WorkbookSnapshot,
  scope: HistoryRestoreScope,
): boolean {
  if (scope.kind === "range") {
    return true;
  }

  const targets =
    scope.kind === "workbook"
      ? historical.sheets
      : historical.sheets.filter((sheet) => sheet.id === scope.sheet);
  if (scope.kind === "workbook") {
    const same_sheets =
      targets.length === current.sheets.length &&
      same(historical.workbook.dataModel ?? null, current.dataModel ?? null);
    if (!same_sheets) {
      return false;
    }
  }

  return targets.every((target) => {
    const live = current.sheets.find((sheet) => sheet.id === target.id);
    return (
      live !== undefined &&
      live.name === target.name &&
      target.rowCount >= live.rowCount &&
      target.columns.length >= live.columns.length &&
      same(live.tables ?? [], target.tables ?? []) &&
      same(live.pivots ?? [], target.pivots ?? [])
    );
  });
}

/** The plan of `scope` with `rewrite` choosing which cells to write again. */
function plan_scope(
  live: Store,
  historical: WorkbookSnapshot,
  store: SheetwriteStore,
  scope: HistoryRestoreScope,
  rewrite: CellRewrite,
): RestoreCommit {
  const current = live.getWorkbook();
  const plan =
    scope.kind === "workbook"
      ? plan_workbook(current, historical, store, rewrite)
      : scope.kind === "sheet"
        ? plan_sheet(current, historical, store, scope.sheet, rewrite)
        : plan_range(current, historical, store, scope.range, rewrite);

  return {
    operations: flatten(plan),
    guards: reference_guards(live, current, plan.shrinking),
  };
}

/**
 * Operations that bring `current` to the historical document in `store` for
 * `scope`. They use the ordinary document operations, so the grid's undo,
 * policy and sync apply to them unchanged. `compareRows` finds the rows whose
 * live cells differ from the version's, so unchanged rows are not written.
 */
export function planRestore(
  live: Store,
  store: SheetwriteStore,
  scope: HistoryRestoreScope,
  compareRows: RowComparer,
): RestoreCommit {
  const current = live.getWorkbook();
  const historical = store.exportSnapshot();
  const live_engine = storeEngine(live);
  const version_engine = storeEngine(store);

  const rewrite: CellRewrite =
    live_engine && version_engine && cells_restore_alone(current, historical, scope)
      ? (sheet, rect) =>
          // A paged datasource sheet can hold cells that are not loaded.
          live_engine.isPaged(sheet)
            ? undefined
            : differing_bands(rect, compareRows(live_engine, version_engine, sheet, rect))
      : REWRITE_ALL;

  return plan_scope(live, historical, store, scope, rewrite);
}

/**
 * The plan of a restore whose live document is known to be the archive head:
 * `changed` lists, per sheet, the only cells where the live document and the
 * version can differ, and `store` is a sparse version that holds those
 * cells. `undefined` when the scope needs cells outside them: a sheet that
 * changes size or columns, a paged datasource sheet, or a change that rewrites
 * the whole scope (see `cells_restore_alone`).
 */
export function planPageRestore(
  live: Store,
  store: SheetwriteStore,
  scope: HistoryRestoreScope,
  changed: ReadonlyMap<SheetId, readonly Rect[]>,
): RestoreCommit | undefined {
  const current = live.getWorkbook();
  const historical = store.exportSnapshot();
  const live_engine = storeEngine(live);
  if (!live_engine || !cells_restore_alone(current, historical, scope)) {
    return undefined;
  }

  const in_scope =
    scope.kind === "workbook"
      ? historical.sheets
      : historical.sheets.filter(
          (sheet) => sheet.id === (scope.kind === "sheet" ? scope.sheet : scope.range.sheet),
        );
  const fits = in_scope.every((target) => {
    const sheet = current.sheets.find((candidate) => candidate.id === target.id);
    return (
      sheet !== undefined &&
      !live_engine.isPaged(target.id) &&
      sheet.rowCount === target.rowCount &&
      same(sheet.columns, target.columns)
    );
  });
  if (!fits) {
    return undefined;
  }

  return plan_scope(live, historical, store, scope, (sheet, rect) =>
    (changed.get(sheet) ?? []).flatMap((part) => {
      const inside = intersection(part, rect);
      return inside ? [inside] : [];
    }),
  );
}
