import type { DiffKernel } from "@sheetwrite/wasm/history";

import type { SheetwriteStore } from "../store.js";
import type { StoreDataEngine } from "../store/data-engine.js";
import { storeEngine } from "../store/engine-registry.js";
import { styleKey } from "../style-dictionary.js";
import type { CellScalar, CellStyle } from "../types/cell.js";
import type { SheetId } from "../types/coordinates.js";
import type { DocumentOp, Sheet, Workbook } from "../types/document.js";
import type { CommittedTransaction } from "../types/transaction.js";
import { HistoryError } from "./codec.js";

/** Bits of `HistoryDiffCells.flags`; a change has one or more of them. */
export const HistoryDiffFlag = Object.freeze({
  /** The literal value changed, or a literal and a formula were swapped. */
  value: 1,
  /** A formula source was added, removed or changed. */
  formula: 2,
  /** The style changed, compared by content. */
  style: 4,
  /** The cell had no value or formula before and has one now. */
  added: 8,
  /** The cell had a value or formula before and has none now. */
  removed: 16,
});

/**
 * Author index of a change that no write in the retained log reaches: the
 * difference is older than the log, so its author is not known. Also the
 * `beforeRow` and `beforeCol` of a cell on a row or column added later.
 */
export const HISTORY_DIFF_NONE = 0xffff_ffff;

/** Largest page a diff returns. */
export const MAX_HISTORY_DIFF_ENTRIES = 1_000;

/** Cells read from each version per window. */
const WINDOW_CELLS = 65_536;

/** Where the next page of a diff starts. Pass it back unchanged. */
export interface HistoryDiffCursor {
  readonly sheet: number;
  readonly row: number;
  readonly piece: number;
  readonly cell: number;
}

/** One diff request between two retained versions. */
export interface HistoryDiffRequest {
  /** The earlier version. */
  from: string;
  /** The later version. */
  to: string;
  /** The `cursor` of the previous page; omit for the first page. */
  cursor?: HistoryDiffCursor;
  /** Changes per page, from 1 to 1,000; default 1,000. */
  maxEntries?: number;
  signal?: AbortSignal;
  /** Where the diff kernel WASM comes from; see `@sheetwrite/wasm/history`. */
  kernel?: BufferSource | URL | string | Request | WebAssembly.Module;
}

/**
 * Changed cells of one page as parallel typed columns, in sheet order and then
 * row by row. Row and column numbers are those of the later version.
 */
export interface HistoryDiffCells {
  /** Index into `HistoryDiffPage.sheetIds`. */
  readonly sheet: Uint32Array;
  readonly row: Uint32Array;
  readonly col: Uint32Array;
  /** Position in the earlier version, or `HISTORY_DIFF_NONE` on an added row or column. */
  readonly beforeRow: Uint32Array;
  readonly beforeCol: Uint32Array;
  /** `HistoryDiffFlag` bits. */
  readonly flags: Uint8Array;
  /** Index into `HistoryDiffPage.authors` of the last writer, or `HISTORY_DIFF_NONE`. */
  readonly author: Uint32Array;
}

/** Source and style of one cell in one version. */
export interface HistoryDiffCell {
  /** Calculated value in that version, for preview. */
  value: CellScalar;
  formula?: string;
  style?: CellStyle;
}

/** Before and after of one changed cell of the page. */
export interface HistoryDiffDetail {
  /** `null` on a row or column that the earlier version did not have. */
  before: HistoryDiffCell | null;
  after: HistoryDiffCell;
  /** Everyone who wrote the cell between the versions, as `authors` indexes, first writer first. */
  writers: readonly number[];
}

/** A sheet that was added, removed, or changed outside its cell values. */
export interface HistoryDiffSheet {
  sheet: SheetId;
  /** Name in the later version, or in the earlier one for a removed sheet. */
  name: string;
  change: "added" | "removed" | "changed";
  /** For `changed`: the sheet fields that differ, such as `name`, `rowCount` or `merges`. */
  fields: readonly string[];
  /** Last writer of a structural or sheet setting change, or `HISTORY_DIFF_NONE`. */
  author: number;
}

/** One bounded page of the difference between two versions. */
export interface HistoryDiffPage {
  /** Sheets added, removed or changed outside their cells; the same on every page. */
  sheets: readonly HistoryDiffSheet[];
  /** Workbook fields that differ, such as `namedRanges` or `calculation`. */
  workbook: readonly string[];
  /** Sheet IDs that `cells.sheet` indexes. */
  sheetIds: readonly SheetId[];
  /** Author IDs that the `author` and `writers` indexes name. */
  authors: readonly string[];
  cells: HistoryDiffCells;
  /** Before and after of each changed cell, in `cells` order. */
  details: readonly HistoryDiffDetail[];
  /**
   * `false` when part of the log between the versions is no longer retained:
   * rows and columns are then compared by position before the retained part,
   * and changes there have no known author.
   */
  logComplete: boolean;
  /** Present when more changes follow; pass it to the next request. */
  cursor?: HistoryDiffCursor;
}

/** Both versions, rebuilt, and the log between them. */
export interface DiffInput {
  before: SheetwriteStore;
  after: SheetwriteStore;
  /** Transactions after the earlier version up to the later one, in order. */
  commits: AsyncIterable<CommittedTransaction>;
  logComplete: boolean;
  request: HistoryDiffRequest;
}

/** Validated page size of a request. */
export function diffPageSize(request: HistoryDiffRequest): number {
  const size = request.maxEntries ?? MAX_HISTORY_DIFF_ENTRIES;
  if (!Number.isInteger(size) || size < 1 || size > MAX_HISTORY_DIFF_ENTRIES) {
    throw new HistoryError("invalid-scope", "A diff page holds 1 to 1,000 changes");
  }

  return size;
}

function engineOf(store: SheetwriteStore): StoreDataEngine {
  const engine = storeEngine(store);
  if (!engine) {
    throw new HistoryError("integrity", "A rebuilt version has no document engine");
  }

  return engine;
}

/** Index of `id` in `list`, added at the end when new. */
function intern(list: string[], index: Map<string, number>, id: string): number {
  let at = index.get(id);
  if (at === undefined) {
    at = list.length;
    list.push(id);
    index.set(id, at);
  }

  return at;
}

/** Log state of one diff: sheet slots in the kernel and who last changed sheet settings. */
interface Tracking {
  kernel: DiffKernel;
  slots: Map<SheetId, number>;
  authors: string[];
  authorIndex: Map<string, number>;
  sheetAuthors: Map<SheetId, number>;
  workbookAuthor: number;
}

function sheetOf(operation: DocumentOp): SheetId | undefined {
  if ("addr" in operation) {
    return operation.addr.sheet;
  }

  if ("range" in operation && operation.range) {
    return operation.range.sheet;
  }

  if ("sheet" in operation) {
    return typeof operation.sheet === "string" ? operation.sheet : operation.sheet.id;
  }

  return undefined;
}

/** Cells that an operation writes, as a rectangle, or `null` for other operations. */
function writtenCells(
  operation: DocumentOp,
): { sheet: SheetId; r0: number; c0: number; r1: number; c1: number } | null {
  switch (operation.op) {
    case "set":
      return {
        sheet: operation.addr.sheet,
        r0: operation.addr.row,
        c0: operation.addr.col,
        r1: operation.addr.row,
        c1: operation.addr.col,
      };
    case "setRange":
    case "setBlock":
    case "restoreBlock":
    case "setRangeStyle":
    case "clearRange":
    case "permuteRows": {
      const { start, end } = operation.range;

      return {
        sheet: operation.range.sheet,
        r0: Math.min(start.row, end.row),
        c0: Math.min(start.col, end.col),
        r1: Math.max(start.row, end.row),
        c1: Math.max(start.col, end.col),
      };
    }
    default:
      return null;
  }
}

/** Feed one logged operation to the kernel: writes, structure and sheet lifecycle. */
function track(state: Tracking, operation: DocumentOp, author: number): void {
  const { kernel, slots } = state;

  const written = writtenCells(operation);
  if (written) {
    const slot = slots.get(written.sheet);
    if (slot !== undefined) {
      kernel.touch(slot, written.r0, written.c0, written.r1, written.c1, author);
    }

    return;
  }

  const sheet = sheetOf(operation);
  if (sheet === undefined) {
    state.workbookAuthor = author;
    return;
  }

  state.sheetAuthors.set(sheet, author);
  const slot = slots.get(sheet);

  switch (operation.op) {
    case "addSheet":
      slots.set(
        operation.sheet.id,
        kernel.addSheet(operation.sheet.rowCount, operation.sheet.columns.length, false),
      );
      break;
    case "removeSheet":
      if (slot !== undefined) {
        kernel.removeSheet(slot);
      }
      slots.delete(operation.sheet);
      break;
    case "addRows":
      if (slot !== undefined) kernel.insertRows(slot, operation.at, operation.count);
      break;
    case "removeRows":
      if (slot !== undefined) kernel.removeRows(slot, operation.at, operation.count);
      break;
    case "moveRows":
      if (slot !== undefined) kernel.moveRows(slot, operation.from, operation.count, operation.to);
      break;
    case "addColumns":
      if (slot !== undefined) kernel.insertCols(slot, operation.at, operation.columns.length);
      break;
    case "removeColumns":
      if (slot !== undefined) kernel.removeCols(slot, operation.at, operation.count);
      break;
    case "moveColumns":
      if (slot !== undefined) kernel.moveCols(slot, operation.from, operation.count, operation.to);
      break;
    default:
      break;
  }
}

/** Plain value of a sheet field, so maps and sets compare by content. */
function plain(value: unknown): string {
  if (value instanceof Map) {
    return JSON.stringify([...value.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  }

  if (value instanceof Set) {
    return JSON.stringify([...value].sort());
  }

  return JSON.stringify(value ?? null);
}

/**
 * Content IDs for the style IDs of both stores: two stores intern styles
 * independently, so equal styles are matched by content.
 */
function styleTables(before: StoreDataEngine, after: StoreDataEngine): [Uint32Array, Uint32Array] {
  const ids = new Map<string, number>();
  const table = (engine: StoreDataEngine) => {
    const styles = engine.styleTable();
    const out = new Uint32Array(styles.length);
    for (let id = 0; id < styles.length; id++) {
      const style = styles[id];
      const key = style ? styleKey(style) : "";
      let content = ids.get(key);
      if (content === undefined) {
        content = ids.size;
        ids.set(key, content);
      }

      out[id] = content;
    }

    return out;
  };

  return [table(before), table(after)];
}

/** Fields of two objects whose values differ, ignoring `skip`. */
function changedFields(
  before: object,
  after: object,
  skip: Readonly<Record<string, true>>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const fields: string[] = [];

  for (const key of [...keys].sort()) {
    if (skip[key]) {
      continue;
    }

    const left: unknown = Reflect.get(before, key);
    const right: unknown = Reflect.get(after, key);
    if (plain(left) !== plain(right)) {
      fields.push(key);
    }
  }

  return fields;
}

const SHEET_SKIP: Readonly<Record<string, true>> = { id: true };
const WORKBOOK_SKIP: Readonly<Record<string, true>> = {
  sheets: true,
  activeSheet: true,
  xlsxSource: true,
};

/** Sheets that were added, removed, or changed outside their cell values. */
function sheetChanges(before: Workbook, after: Workbook, state: Tracking): HistoryDiffSheet[] {
  const changes: HistoryDiffSheet[] = [];
  const earlier = new Map(before.sheets.map((sheet, order) => [sheet.id, { sheet, order }]));
  const later = new Set(after.sheets.map((sheet) => sheet.id));
  const author = (sheet: SheetId) => state.sheetAuthors.get(sheet) ?? HISTORY_DIFF_NONE;

  after.sheets.forEach((sheet: Sheet, order) => {
    const previous = earlier.get(sheet.id);
    if (!previous) {
      changes.push({
        sheet: sheet.id,
        name: sheet.name,
        change: "added",
        fields: [],
        author: author(sheet.id),
      });
      return;
    }

    const fields = changedFields(previous.sheet, sheet, SHEET_SKIP);
    if (previous.order !== order) {
      fields.push("order");
    }

    if (fields.length > 0) {
      changes.push({
        sheet: sheet.id,
        name: sheet.name,
        change: "changed",
        fields,
        author: author(sheet.id),
      });
    }
  });

  for (const { sheet } of earlier.values()) {
    if (!later.has(sheet.id)) {
      changes.push({
        sheet: sheet.id,
        name: sheet.name,
        change: "removed",
        fields: [],
        author: author(sheet.id),
      });
    }
  }

  return changes;
}

/** Rectangle pieces of one window: each lies inside one row and one column segment. */
interface Piece {
  /** Offsets inside the window. */
  row: number;
  col: number;
  rows: number;
  cols: number;
  /** Earlier position, or `HISTORY_DIFF_NONE` on an added row or column. */
  beforeRow: number;
  beforeCol: number;
}

/** Split lines `first..first + count` along `segments` (`[start, length, origin]*`). */
function spans(
  segments: Uint32Array,
  first: number,
  count: number,
): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  const end = first + count;

  for (let at = 0; at + 2 < segments.length; at += 3) {
    const start = segments[at] ?? 0;
    const length = segments[at + 1] ?? 0;
    const origin = segments[at + 2] ?? HISTORY_DIFF_NONE;
    const lo = Math.max(start, first);
    const hi = Math.min(start + length, end);
    if (lo < hi) {
      out.push([lo, hi - lo, origin === HISTORY_DIFF_NONE ? origin : origin + (lo - start)]);
    }
  }

  return out;
}

function pieces(
  rowSegments: Uint32Array,
  colSegments: Uint32Array,
  row0: number,
  rows: number,
  cols: number,
  earlier: Sheet | undefined,
): Piece[] {
  const out: Piece[] = [];

  for (const [row, rowCount, beforeRow] of spans(rowSegments, row0, rows)) {
    for (const [col, colCount, beforeCol] of spans(colSegments, 0, cols)) {
      // A position outside the earlier sheet can only come from a log that is
      // not complete; such cells are compared with nothing.
      const known =
        earlier !== undefined &&
        beforeRow !== HISTORY_DIFF_NONE &&
        beforeCol !== HISTORY_DIFF_NONE &&
        beforeRow + rowCount <= earlier.rowCount &&
        beforeCol + colCount <= earlier.columns.length;

      out.push({
        row: row - row0,
        col,
        rows: rowCount,
        cols: colCount,
        beforeRow: known ? beforeRow : HISTORY_DIFF_NONE,
        beforeCol: known ? beforeCol : HISTORY_DIFF_NONE,
      });
    }
  }

  return out;
}

function transferOf(
  engine: StoreDataEngine,
  sheet: SheetId,
  row: number,
  col: number,
  rows: number,
  cols: number,
): Uint8Array {
  const bytes = engine.captureRangeTransfer({
    sheet,
    start: { row, col },
    end: { row: row + rows - 1, col: col + cols - 1 },
  });
  if (!bytes) {
    throw new HistoryError("integrity", "A rebuilt version could not be read");
  }

  return bytes;
}

/** Validate a cursor against the later version's sheets. */
function startAt(cursor: HistoryDiffCursor | undefined, sheets: number): HistoryDiffCursor {
  if (!cursor) {
    return { sheet: 0, row: 0, piece: 0, cell: 0 };
  }

  const valid =
    [cursor.sheet, cursor.row, cursor.piece, cursor.cell].every(
      (value) => Number.isInteger(value) && value >= 0,
    ) && cursor.sheet < sheets;
  if (!valid) {
    throw new HistoryError("invalid-scope", "The diff cursor does not belong to these versions");
  }

  return cursor;
}

/**
 * Scan the later version from `start`, window by window, until the page is
 * full. Returns the cursor of the next page, or `undefined` at the end.
 */
function scan(
  state: Tracking,
  before: StoreDataEngine,
  after: StoreDataEngine,
  earlier: Workbook,
  later: Workbook,
  start: HistoryDiffCursor,
  signal: AbortSignal | undefined,
): HistoryDiffCursor | undefined {
  const { kernel } = state;
  const earlierSheets = new Map(earlier.sheets.map((sheet) => [sheet.id, sheet]));

  for (let index = start.sheet; index < later.sheets.length; index++) {
    const sheet = later.sheets[index];
    const slot = sheet ? state.slots.get(sheet.id) : undefined;
    if (!sheet || slot === undefined || sheet.rowCount === 0 || sheet.columns.length === 0) {
      continue;
    }

    const cols = sheet.columns.length;
    const windowRows = Math.max(1, Math.floor(WINDOW_CELLS / cols));
    const rowSegments = Uint32Array.from(kernel.rowSegments(slot));
    const colSegments = Uint32Array.from(kernel.colSegments(slot));
    const resuming = index === start.sheet;

    for (let row0 = resuming ? start.row : 0; row0 < sheet.rowCount; row0 += windowRows) {
      signal?.throwIfAborted();

      const rows = Math.min(windowRows, sheet.rowCount - row0);
      if (!kernel.loadAfter(transferOf(after, sheet.id, row0, 0, rows, cols))) {
        throw new HistoryError("integrity", "The diff kernel rejected a rebuilt window");
      }

      const parts = pieces(rowSegments, colSegments, row0, rows, cols, earlierSheets.get(sheet.id));
      const first = resuming && row0 === start.row ? start.piece : 0;

      for (let at = first; at < parts.length; at++) {
        const part = parts[at];
        if (!part) {
          continue;
        }

        const earlierCells = part.beforeRow !== HISTORY_DIFF_NONE;
        if (
          earlierCells &&
          !kernel.loadBefore(
            transferOf(before, sheet.id, part.beforeRow, part.beforeCol, part.rows, part.cols),
          )
        ) {
          throw new HistoryError("integrity", "The diff kernel rejected a rebuilt window");
        }

        const from = resuming && row0 === start.row && at === start.piece ? start.cell : 0;
        const next = kernel.compare(
          slot,
          earlierCells,
          part.row,
          part.col,
          part.rows,
          part.cols,
          row0 + part.row,
          part.col,
          part.beforeRow,
          part.beforeCol,
          from,
        );

        if (next < part.rows * part.cols) {
          return { sheet: index, row: row0, piece: at, cell: next };
        }
      }
    }
  }

  return undefined;
}

function cellIn(store: SheetwriteStore, sheet: SheetId, row: number, col: number): HistoryDiffCell {
  const addr = { sheet, row, col };
  const cell = store.getCell(addr);
  const formula = store.getFormula(addr);

  return {
    value: cell.resolved,
    ...(formula !== null ? { formula } : {}),
    ...(Object.keys(cell.style).length > 0 ? { style: cell.style } : {}),
  };
}

/**
 * One page of the difference between two rebuilt versions. The kernel module
 * loads on the first call; both stores stay owned by the caller.
 */
export async function diffStores(input: DiffInput): Promise<HistoryDiffPage> {
  const { request } = input;
  const size = diffPageSize(request);
  const { DiffKernel, loadHistoryKernel } = await import("@sheetwrite/wasm/history");
  await loadHistoryKernel(request.kernel);
  request.signal?.throwIfAborted();

  const before = engineOf(input.before);
  const after = engineOf(input.after);
  const earlier = input.before.getWorkbook();
  const later = input.after.getWorkbook();
  const start = startAt(request.cursor, later.sheets.length);

  const kernel = new DiffKernel(size);
  try {
    const state: Tracking = {
      kernel,
      slots: new Map(),
      authors: [],
      authorIndex: new Map(),
      sheetAuthors: new Map(),
      workbookAuthor: HISTORY_DIFF_NONE,
    };

    for (const sheet of earlier.sheets) {
      state.slots.set(sheet.id, kernel.addSheet(sheet.rowCount, sheet.columns.length, true));
    }

    for await (const commit of input.commits) {
      const author = intern(state.authors, state.authorIndex, commit.authorId);
      for (const operation of commit.operations) {
        track(state, operation, author);
      }
      request.signal?.throwIfAborted();
    }

    // A sheet the retained log does not explain is compared by position.
    for (const sheet of later.sheets) {
      if (!state.slots.has(sheet.id)) {
        const known = earlier.sheets.some((candidate) => candidate.id === sheet.id);
        state.slots.set(sheet.id, kernel.addSheet(sheet.rowCount, sheet.columns.length, known));
      }
    }

    const [beforeStyles, afterStyles] = styleTables(before, after);
    kernel.setStyles(beforeStyles, afterStyles);

    const cursor = scan(state, before, after, earlier, later, start, request.signal);

    return page(state, input, later, earlier, cursor);
  } finally {
    kernel.free();
  }
}

/** Read the page out of the kernel, with details for its cells. */
function page(
  state: Tracking,
  input: DiffInput,
  later: Workbook,
  earlier: Workbook,
  cursor: HistoryDiffCursor | undefined,
): HistoryDiffPage {
  const { kernel } = state;
  const slotSheets = new Map([...state.slots].map(([sheet, slot]) => [slot, sheet]));
  const sheetIds: SheetId[] = [];
  const sheetIndex = new Map<string, number>();

  const slots = Uint32Array.from(kernel.pageSheets());
  const cells: HistoryDiffCells = {
    sheet: new Uint32Array(slots.length),
    row: Uint32Array.from(kernel.pageRows()),
    col: Uint32Array.from(kernel.pageCols()),
    beforeRow: Uint32Array.from(kernel.pageBeforeRows()),
    beforeCol: Uint32Array.from(kernel.pageBeforeCols()),
    flags: Uint8Array.from(kernel.pageFlags()),
    author: Uint32Array.from(kernel.pageAuthors()),
  };

  const details: HistoryDiffDetail[] = [];
  for (let at = 0; at < slots.length; at++) {
    const slot = slots[at] ?? 0;
    const sheet = slotSheets.get(slot) ?? "";
    cells.sheet[at] = intern(sheetIds, sheetIndex, sheet);

    const row = cells.row[at] ?? 0;
    const col = cells.col[at] ?? 0;
    const beforeRow = cells.beforeRow[at] ?? HISTORY_DIFF_NONE;
    const beforeCol = cells.beforeCol[at] ?? HISTORY_DIFF_NONE;

    details.push({
      before:
        beforeRow === HISTORY_DIFF_NONE ? null : cellIn(input.before, sheet, beforeRow, beforeCol),
      after: cellIn(input.after, sheet, row, col),
      writers: [...kernel.cellAuthors(slot, row, col)],
    });
  }

  return {
    sheets: sheetChanges(earlier, later, state),
    workbook: changedFields(earlier, later, WORKBOOK_SKIP),
    sheetIds,
    authors: state.authors,
    cells,
    details,
    logComplete: input.logComplete,
    ...(cursor ? { cursor } : {}),
  };
}
