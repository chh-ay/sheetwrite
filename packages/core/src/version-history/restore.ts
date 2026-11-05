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

/** Cells captured per restore block: large enough to amortize capture, small enough to band. */
const BAND_CELLS = 65_536;

/** What a restore covers. */
export type HistoryRestoreScope =
  | { kind: "workbook" }
  | { kind: "sheet"; sheet: SheetId }
  | { kind: "range"; range: Range };

/** Options for `HistoryArchive.restoreVersion`. */
export interface HistoryRestoreOptions {
  /** The grid's coordinator in a shared document; the restore then needs an idle queue. */
  sync?: SyncCoordinator;
  signal?: AbortSignal;
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

interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

function emptyPlan(): RestorePlan {
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
function referenceGuards(
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

function invalidScope(message: string): HistoryError {
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

function rangeRect(range: Range): Rect {
  return {
    r0: Math.min(range.start.row, range.end.row),
    c0: Math.min(range.start.col, range.end.col),
    r1: Math.max(range.start.row, range.end.row),
    c1: Math.max(range.start.col, range.end.col),
  };
}

function mergeRect(merge: MergeRange): Rect {
  return { r0: merge.r0, c0: merge.c0, r1: merge.r1, c1: merge.c1 };
}

function rectRange(sheet: SheetId, rect: Rect): Range {
  return {
    sheet,
    start: { row: rect.r0, col: rect.c0 },
    end: { row: rect.r1, col: rect.c1 },
  };
}

function intersects(left: Rect, right: Rect): boolean {
  return left.r0 <= right.r1 && right.r0 <= left.r1 && left.c0 <= right.c1 && right.c0 <= left.c1;
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    outer.r0 <= inner.r0 && inner.r1 <= outer.r1 && outer.c0 <= inner.c0 && inner.c1 <= outer.c1
  );
}

function cellInside(rect: Rect, row: number, col: number): boolean {
  return row >= rect.r0 && row <= rect.r1 && col >= rect.c0 && col <= rect.c1;
}

/** Sorted rows of `rect` that hold a historical cell. */
function occupiedRows(sheet: SheetSnapshot, rect: Rect): number[] {
  const rows = new Set<number>();

  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      const row = block.startRow + cell.rowOffset;
      const col = block.startCol + cell.colOffset;
      if (cellInside(rect, row, col)) {
        rows.add(row);
      }
    }
  }

  return [...rows].sort((left, right) => left - right);
}

/**
 * Historical cells of `rect` as `setBlock` operations, captured in row bands
 * that hold cells, so a sparse sheet does not produce blocks of empty rows.
 * The capture is the engine's undo capture: formula sources, references and
 * styles come back exactly.
 */
function cellBands(store: SheetwriteStore, sheet: SheetSnapshot, rect: Rect): DocumentOp[] {
  const rows = occupiedRows(sheet, rect);
  const width = rect.c1 - rect.c0 + 1;
  const bandRows = Math.max(1, Math.floor(BAND_CELLS / width));

  const operations: DocumentOp[] = [];
  let index = 0;

  while (index < rows.length) {
    const start = rows[index] ?? 0;
    let end = start;

    while (index < rows.length && (rows[index] ?? 0) - start < bandRows) {
      end = rows[index] ?? end;
      index++;
    }

    const range = rectRange(sheet.id, { r0: start, c0: rect.c0, r1: end, c1: rect.c1 });
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

function currentRowMeta(sheet: Sheet): number[] {
  const rows = new Set<number>([...(sheet.rowHeights?.keys() ?? []), ...(sheet.hiddenRows ?? [])]);
  return [...rows];
}

function noteKey(note: CellNote): string {
  return `${note.addr.row}:${note.addr.col}`;
}

/** Notes of `current` inside `rect` that the historical notes do not keep. */
function noteOperations(
  sheet: SheetId,
  current: readonly CellNote[],
  historical: readonly CellNote[],
  rect: Rect,
): { clear: DocumentOp[]; set: DocumentOp[] } {
  const inside = (note: CellNote) => cellInside(rect, note.addr.row, note.addr.col);
  const kept = new Map(historical.filter(inside).map((note) => [noteKey(note), note]));

  const clear: DocumentOp[] = [];
  for (const note of current.filter(inside)) {
    if (kept.get(noteKey(note))?.text !== note.text) {
      clear.push({ op: "setNote", addr: { ...note.addr, sheet }, text: null });
    }
  }

  const set: DocumentOp[] = [];
  const currentByKey = new Map(current.filter(inside).map((note) => [noteKey(note), note]));
  for (const note of kept.values()) {
    if (currentByKey.get(noteKey(note))?.text !== note.text) {
      set.push({ op: "setNote", addr: { ...note.addr, sheet }, text: note.text });
    }
  }

  return { clear, set };
}

function rowMetaOf(sheet: Sheet, row: number): RowMetadata | null {
  const height = sheet.rowHeights?.get(row);
  const hidden = sheet.hiddenRows?.has(row) ?? false;
  if (height === undefined && !hidden) {
    return null;
  }

  return { ...(height !== undefined ? { height } : {}), ...(hidden ? { hidden } : {}) };
}

/** Remove or replace each keyed object of a sheet: tables, charts, pivots, rules. */
function keyedObjects<T extends { id: string }>(
  current: readonly T[],
  historical: readonly T[],
  remove: (id: string) => DocumentOp,
  set: (item: T, existed: boolean) => DocumentOp,
  plan: RestorePlan,
): void {
  const historicalIds = new Set(historical.map((item) => item.id));
  const currentById = new Map(current.map((item) => [item.id, item]));

  for (const item of current) {
    if (!historicalIds.has(item.id)) {
      plan.removals.push(remove(item.id));
    }
  }

  for (const item of historical) {
    const existing = currentById.get(item.id);
    if (!existing || !same(existing, item)) {
      plan.additions.push(set(item, existing !== undefined));
    }
  }
}

/**
 * Bring a dashboard to its historical items and pivots in place. It has no
 * cells, rows, columns or sheet formats to restore.
 */
function planDashboardInPlace(current: Sheet, historical: SheetSnapshot, plan: RestorePlan): void {
  const id = current.id;

  keyedObjects(
    current.pivots ?? [],
    historical.pivots ?? [],
    (pivotId) => ({ op: "removePivot", sheet: id, id: pivotId }),
    (pivot) => ({ op: "setPivot", sheet: id, pivot }),
    plan,
  );

  keyedObjects(
    current.dashboard?.items ?? [],
    historical.dashboard?.items ?? [],
    (itemId) => ({ op: "removeDashboardItem", sheet: id, id: itemId }),
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
function planSheetInPlace(
  current: Sheet,
  historical: SheetSnapshot,
  store: SheetwriteStore,
  plan: RestorePlan,
): void {
  const id = current.id;

  // A sheet keeps its kind for its whole life, so only a removed and re-added sheet can differ.
  if (isDashboard(current) !== isDashboard(historical)) {
    throw invalidScope(
      `Sheet ${current.name} changed between a worksheet and a dashboard since this version`,
    );
  }
  if (isDashboard(current)) {
    planDashboardInPlace(current, historical, plan);
    return;
  }

  for (const merge of current.merges ?? []) {
    plan.removals.push({ op: "removeMerge", sheet: id, merge });
  }

  keyedObjects(
    current.validationRules ?? [],
    historical.validationRules ?? [],
    (ruleId) => ({ op: "removeValidationRule", sheet: id, id: ruleId }),
    (rule) => ({ op: "setValidationRule", sheet: id, rule }),
    plan,
  );

  keyedObjects(
    current.hyperlinks ?? [],
    historical.hyperlinks ?? [],
    (linkId) => ({ op: "removeHyperlink", sheet: id, id: linkId }),
    (hyperlink) => ({ op: "setHyperlink", sheet: id, hyperlink }),
    plan,
  );

  keyedObjects(
    current.protectedRanges ?? [],
    historical.protectedRanges ?? [],
    (rangeId) => ({ op: "removeProtectedRange", sheet: id, id: rangeId }),
    (protectedRange) => ({ op: "setProtectedRange", sheet: id, protectedRange }),
    plan,
  );

  keyedObjects(
    current.charts ?? [],
    historical.charts ?? [],
    (chartId) => ({ op: "removeChart", sheet: id, id: chartId }),
    (chart) => ({ op: "setChart", sheet: id, chart }),
    plan,
  );

  keyedObjects(
    current.pivots ?? [],
    historical.pivots ?? [],
    (pivotId) => ({ op: "removePivot", sheet: id, id: pivotId }),
    (pivot) => ({ op: "setPivot", sheet: id, pivot }),
    plan,
  );

  keyedObjects(
    current.tables ?? [],
    historical.tables ?? [],
    (tableId) => ({ op: "removeTable", sheet: id, tableId }),
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

  // Dimensions, at the end only.
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

  const sharedColumns = Math.min(current.columns.length, historical.columns.length);
  if (historical.columns.length < current.columns.length) {
    plan.shrinking.add(id);
    plan.structure.push({
      op: "removeColumns",
      sheet: id,
      at: historical.columns.length,
      count: current.columns.length - historical.columns.length,
    });
  }

  for (let col = 0; col < sharedColumns; col++) {
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

  // Cells: clear the restored extent, then write the historical cells.
  const extent: Rect = {
    r0: 0,
    c0: 0,
    r1: historical.rowCount - 1,
    c1: historical.columns.length - 1,
  };

  if (historical.rowCount > 0) {
    const notes = noteOperations(id, current.notes ?? [], historical.notes ?? [], extent);
    plan.content.push(...notes.clear);
    plan.content.push({
      op: "clearRange",
      range: rectRange(id, extent),
      contents: true,
      style: true,
    });
    plan.content.push(...cellBands(store, historical, extent));
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
    },
  });

  const historicalMeta = new Map(historical.rowMeta ?? []);
  for (const row of currentRowMeta(current)) {
    if (row < historical.rowCount && !historicalMeta.has(row)) {
      plan.additions.push({ op: "setRowMeta", sheet: id, row, meta: null });
    }
  }

  for (const [row, meta] of historicalMeta) {
    if (!same(rowMetaOf(current, row), meta)) {
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
function planSheet(
  current: Workbook,
  historical: WorkbookSnapshot,
  store: SheetwriteStore,
  sheetId: SheetId,
): RestorePlan {
  const target = historical.sheets.find((sheet) => sheet.id === sheetId);
  if (!target) {
    throw invalidScope(`Sheet ${sheetId} did not exist in this version`);
  }

  const plan = emptyPlan();
  const owner = current.sheets.find(
    (sheet) => sheet.name.toLowerCase() === target.name.toLowerCase(),
  );
  if (owner && owner.id !== sheetId) {
    throw invalidScope(`Another sheet is named ${target.name}; rename it before restoring`);
  }

  const live = current.sheets.find((sheet) => sheet.id === sheetId);
  if (!live) {
    plan.sheets.push({
      op: "addSheet",
      sheet: { ...target, order: Math.min(target.order, current.sheets.length) },
    });

    return plan;
  }

  if (live.name !== target.name) {
    plan.sheets.push({ op: "renameSheet", sheet: sheetId, name: target.name });
  }

  planSheetInPlace(live, target, store, plan);

  return plan;
}

function nameKey(name: NamedRangeSnapshot | { name: string; scope?: SheetId }): string {
  return `${name.scope ?? ""}\u0000${name.name.toLowerCase()}`;
}

/** Restore every sheet, their order, workbook names, relationships and calculation options. */
function planWorkbook(
  current: Workbook,
  historical: WorkbookSnapshot,
  store: SheetwriteStore,
): RestorePlan {
  const plan = emptyPlan();
  const historicalIds = new Set(historical.sheets.map((sheet) => sheet.id));
  const currentIds = new Set(current.sheets.map((sheet) => sheet.id));
  const historicalNames = new Set(historical.sheets.map((sheet) => sheet.name.toLowerCase()));

  // Relationships name tables, so they go before tables and come back after them.
  const historicalRelationships = historical.workbook.dataModel?.relationships ?? [];
  const relationshipIds = new Set(historicalRelationships.map((relationship) => relationship.id));
  for (const relationship of current.dataModel?.relationships ?? []) {
    if (!relationshipIds.has(relationship.id)) {
      plan.removals.push({ op: "removeRelationship", id: relationship.id });
    }
  }

  // A current sheet holding a name that another sheet takes back moves to a free name first.
  let free = 1;
  const taken = new Set([
    ...historicalNames,
    ...current.sheets.map((sheet) => sheet.name.toLowerCase()),
  ]);
  for (const sheet of current.sheets) {
    const target = historical.sheets.find((candidate) => candidate.id === sheet.id);
    const moves = target === undefined || target.name !== sheet.name;
    if (moves && historicalNames.has(sheet.name.toLowerCase())) {
      while (taken.has(`restore ${free}`)) {
        free++;
      }

      const name = `Restore ${free}`;
      taken.add(name.toLowerCase());
      plan.sheets.push({ op: "renameSheet", sheet: sheet.id, name });
    }
  }

  for (const target of historical.sheets) {
    if (!currentIds.has(target.id)) {
      plan.sheets.push({
        op: "addSheet",
        sheet: { ...target, order: current.sheets.length },
      });
    }
  }

  for (const sheet of current.sheets) {
    if (!historicalIds.has(sheet.id)) {
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
      planSheetInPlace(live, target, store, plan);
    }
  }

  const historicalNamesByKey = new Map(
    (historical.workbook.namedRanges ?? []).map((name) => [nameKey(name), name]),
  );
  for (const name of current.namedRanges ?? []) {
    if (!historicalNamesByKey.has(nameKey(name))) {
      plan.removals.push({
        op: "removeNamedRange",
        name: name.name,
        ...(name.scope !== undefined ? { scope: name.scope } : {}),
      });
    }
  }

  const currentNames = new Map((current.namedRanges ?? []).map((name) => [nameKey(name), name]));
  for (const [key, name] of historicalNamesByKey) {
    if (!same(currentNames.get(key), name)) {
      plan.names.push({ op: "setNamedRange", namedRange: name });
    }
  }

  const currentRelationships = new Map(
    (current.dataModel?.relationships ?? []).map((relationship) => [relationship.id, relationship]),
  );
  for (const relationship of historicalRelationships) {
    if (!same(currentRelationships.get(relationship.id), relationship)) {
      plan.additions.push({ op: "setRelationship", relationship });
    }
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

/** Merges and hyperlinks that a range restore would cut, from either side of the restore. */
function assertWhole(rect: Rect, objects: ReadonlyArray<{ rect: Rect; label: string }>): void {
  for (const object of objects) {
    if (intersects(rect, object.rect) && !contains(rect, object.rect)) {
      const { r0, c0, r1, c1 } = object.rect;
      throw invalidScope(
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
function planRange(
  current: Workbook,
  historical: WorkbookSnapshot,
  store: SheetwriteStore,
  range: Range,
): RestorePlan {
  const live = current.sheets.find((sheet) => sheet.id === range.sheet);
  const target = historical.sheets.find((sheet) => sheet.id === range.sheet);
  if (!live || !target) {
    throw invalidScope("The range's sheet must exist now and in this version");
  }

  const rect = rangeRect(range);
  const fits = (rows: number, cols: number) =>
    rect.r0 >= 0 && rect.c0 >= 0 && rect.r1 < rows && rect.c1 < cols;
  if (!fits(live.rowCount, live.columns.length) || !fits(target.rowCount, target.columns.length)) {
    throw invalidScope("The range must lie inside the sheet now and in this version");
  }

  const merges = (items: readonly MergeRange[] | undefined) =>
    (items ?? []).map((merge) => ({ rect: mergeRect(merge), label: "merged cell", merge }));
  const links = (items: readonly CellHyperlink[] | undefined) =>
    (items ?? []).map((hyperlink) => ({
      rect: rangeRect(hyperlink.range),
      label: "hyperlink",
      hyperlink,
    }));

  const currentMerges = merges(live.merges);
  const historicalMerges = merges(target.merges);
  const currentLinks = links(live.hyperlinks);
  const historicalLinks = links(target.hyperlinks);
  assertWhole(rect, [...currentMerges, ...historicalMerges, ...currentLinks, ...historicalLinks]);

  const plan = emptyPlan();
  const id = range.sheet;

  for (const { rect: area, merge } of currentMerges) {
    if (contains(rect, area)) {
      plan.removals.push({ op: "removeMerge", sheet: id, merge });
    }
  }

  for (const { rect: area, hyperlink } of currentLinks) {
    if (contains(rect, area)) {
      plan.removals.push({ op: "removeHyperlink", sheet: id, id: hyperlink.id });
    }
  }

  const notes = noteOperations(id, live.notes ?? [], target.notes ?? [], rect);
  plan.content.push(...notes.clear);
  plan.content.push({ op: "clearRange", range: rectRange(id, rect), contents: true, style: true });
  plan.content.push(...cellBands(store, target, rect));
  plan.content.push(...notes.set);

  for (const { rect: area, merge } of historicalMerges) {
    if (contains(rect, area)) {
      plan.additions.push({ op: "addMerge", sheet: id, merge });
    }
  }

  for (const { rect: area, hyperlink } of historicalLinks) {
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
 * Operations that bring `current` to the historical document in `store` for
 * `scope`. They use the ordinary document operations, so the grid's undo,
 * policy and sync apply to them unchanged.
 */
export function planRestore(
  live: Store,
  store: SheetwriteStore,
  scope: HistoryRestoreScope,
): RestoreCommit {
  const current = live.getWorkbook();
  const historical = store.exportSnapshot();

  const plan =
    scope.kind === "workbook"
      ? planWorkbook(current, historical, store)
      : scope.kind === "sheet"
        ? planSheet(current, historical, store, scope.sheet)
        : planRange(current, historical, store, scope.range);

  return {
    operations: flatten(plan),
    guards: referenceGuards(live, current, plan.shrinking),
  };
}
