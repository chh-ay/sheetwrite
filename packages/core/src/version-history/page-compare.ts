import type { SheetwriteStore } from "../store.js";
import { storeEngine } from "../store/engine-registry.js";
import type { SheetId } from "../types/coordinates.js";
import type { DocumentOp } from "../types/document.js";
import {
  type CheckpointManifest,
  type CheckpointPage,
  type CheckpointSheet,
  PAGE_COLS,
  PAGE_ROWS,
} from "./checkpoint.js";
import { HistoryError } from "./codec.js";
import {
  comparedPieces,
  HISTORY_DIFF_NONE,
  type HistoryDiffDetail,
  type HistoryDiffPage,
  type Piece,
  type SheetShape,
  type Tracking,
  writtenCells,
} from "./diff.js";

/**
 * Operations a log tail may hold for a compare by page. Each one changes the
 * sources and styles of the cells in its rectangle only, or no cell at all.
 * Every other operation (structure, moves, sorts, renames, tables, names,
 * sheets) can shift pages or rewrite sources outside its rectangle.
 */
const PAGE_SAFE_OPERATIONS: Readonly<Partial<Record<DocumentOp["op"], true>>> = {
  set: true,
  setRange: true,
  setBlock: true,
  restoreBlock: true,
  setRangeStyle: true,
  clearRange: true,
  setNote: true,
  setRowMeta: true,
};

/**
 * A compare by page reads at most this share of both versions' pages. Above
 * it, the sparse rebuild costs about as much as a whole one.
 */
const MAX_PAGE_SHARE = 0.25;

/** Rectangle of cells, inclusive. */
interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** The cells that a version's log tail writes, by sheet. */
export type TailWrites = Map<SheetId, Rect[]>;

/**
 * Add the cells that `operations` write to `writes`. Returns `false` when an
 * operation is not one a compare by page can follow.
 */
export function addTailWrites(writes: TailWrites, operations: readonly DocumentOp[]): boolean {
  for (const operation of operations) {
    if (!PAGE_SAFE_OPERATIONS[operation.op]) {
      return false;
    }

    const written = writtenCells(operation);
    if (written) {
      const rects = writes.get(written.sheet) ?? [];
      rects.push(written);
      writes.set(written.sheet, rects);
    }
  }

  return true;
}

/** Cell pages of each manifest sheet to read, as `row:col` of their top-left cell. */
export interface PageSelection {
  earlier: ReadonlyArray<ReadonlySet<string>>;
  later: ReadonlyArray<ReadonlySet<string>>;
}

function pageKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/** The sheet ID of a manifest sheet. */
function sheetId(sheet: CheckpointSheet): SheetId {
  const { id } = sheet.fields;
  if (typeof id !== "string") {
    throw new HistoryError("integrity", "Invalid history sheet manifest");
  }

  return id;
}

/** The sheets of a checkpoint whose log tail keeps every sheet's size, as the diff kernel sees them. */
export function manifestShapes(manifest: CheckpointManifest): SheetShape[] {
  return manifest.sheets.map((sheet) => ({
    id: sheetId(sheet),
    rowCount: sheet.rowCount,
    colCount: sheet.colCount,
  }));
}

/**
 * Page grid of one sheet: page positions are numbered row-major, one number
 * per 16-row × 4-column page.
 */
class PageGrid {
  readonly columns: number;
  readonly ids = new Map<number, string>();

  constructor(readonly sheet: CheckpointSheet) {
    this.columns = Math.ceil(sheet.colCount / PAGE_COLS);
    for (const [row, col, id] of sheet.pages) {
      this.ids.set(this.at(row, col), id);
    }
  }

  /** Position of the page that holds cell (`row`, `col`). */
  at(row: number, col: number): number {
    return Math.floor(row / PAGE_ROWS) * this.columns + Math.floor(col / PAGE_COLS);
  }

  /** Positions of the pages that rectangle `rect` overlaps. */
  *overlapping(rect: Rect): Generator<number> {
    for (let row = Math.floor(rect.r0 / PAGE_ROWS); row <= Math.floor(rect.r1 / PAGE_ROWS); row++) {
      for (
        let col = Math.floor(rect.c0 / PAGE_COLS);
        col <= Math.floor(rect.c1 / PAGE_COLS);
        col++
      ) {
        yield row * this.columns + col;
      }
    }
  }

  /** The cells of the page at `position`. */
  extent(position: number): Rect {
    const r0 = Math.floor(position / this.columns) * PAGE_ROWS;
    const c0 = (position % this.columns) * PAGE_COLS;

    return { r0, c0, r1: r0 + PAGE_ROWS - 1, c1: c0 + PAGE_COLS - 1 };
  }

  /** `row:col` keys of the stored pages at `positions`. */
  stored(positions: ReadonlySet<number>): Set<string> {
    const keys = new Set<string>();
    for (const [row, col] of this.sheet.pages) {
      if (positions.has(this.at(row, col))) {
        keys.add(pageKey(row, col));
      }
    }

    return keys;
  }
}

function intersect(left: Rect, right: Rect): Rect | undefined {
  const rect = {
    r0: Math.max(left.r0, right.r0),
    c0: Math.max(left.c0, right.c0),
    r1: Math.min(left.r1, right.r1),
    c1: Math.min(left.c1, right.c1),
  };

  return rect.r0 <= rect.r1 && rect.c0 <= rect.c1 ? rect : undefined;
}

/** A compared piece as later cells, the earlier cells they meet, and the offset between them. */
interface Pairing {
  later: Rect;
  earlier: Rect;
  rowShift: number;
  colShift: number;
}

function pairing(piece: Piece): Pairing {
  const later = {
    r0: piece.row,
    c0: piece.col,
    r1: piece.row + piece.rows - 1,
    c1: piece.col + piece.cols - 1,
  };
  const rowShift = piece.beforeRow - piece.row;
  const colShift = piece.beforeCol - piece.col;

  return {
    later,
    earlier: {
      r0: later.r0 + rowShift,
      c0: later.c0 + colShift,
      r1: later.r1 + rowShift,
      c1: later.c1 + colShift,
    },
    rowShift,
    colShift,
  };
}

/** Offset that every compared cell of a later page has, or why it has none. */
type PageShift = { rowShift: number; colShift: number } | "mixed" | "unpaired";

/**
 * Pages of one sheet whose cells can differ between the versions, closed so
 * that every compared pair of cells is read on both sides or on neither.
 * Returns `false` once more than `budget` stored pages would be read.
 */
class SheetSelection {
  readonly later = new Set<number>();
  readonly earlier = new Set<number>();
  private readonly pending: Array<["later" | "earlier", number]> = [];
  private readonly pairings: Pairing[] = [];
  private reads = 0;

  constructor(
    private readonly laterGrid: PageGrid,
    private readonly earlierGrid: PageGrid,
    pieces: readonly Piece[],
    private readonly budget: { pages: number },
  ) {
    for (const piece of pieces) {
      if (piece.beforeRow !== HISTORY_DIFF_NONE) {
        this.pairings.push(pairing(piece));
      }
    }

    const shifts = new Map<number, PageShift>();
    for (const piece of pieces) {
      const known = piece.beforeRow !== HISTORY_DIFF_NONE;
      const shift: PageShift = known
        ? { rowShift: piece.beforeRow - piece.row, colShift: piece.beforeCol - piece.col }
        : "unpaired";
      const cells = pairing(piece).later;
      for (const position of laterGrid.overlapping(cells)) {
        const seen = shifts.get(position);
        shifts.set(position, seen === undefined || sameShift(seen, shift) ? shift : "mixed");
      }
    }

    for (const [position, shift] of shifts) {
      if (!this.unchanged(position, shift)) {
        this.markLater(position);
      }
    }
  }

  /** A later page that maps whole onto an earlier page with the same content. */
  private unchanged(position: number, shift: PageShift): boolean {
    if (typeof shift === "string" || shift.rowShift % PAGE_ROWS !== 0) {
      return false;
    }

    if (shift.colShift % PAGE_COLS !== 0) {
      return false;
    }

    const cells = this.laterGrid.extent(position);
    const earlier = this.earlierGrid.at(cells.r0 + shift.rowShift, cells.c0 + shift.colShift);

    return this.laterGrid.ids.get(position) === this.earlierGrid.ids.get(earlier);
  }

  markLater(position: number): void {
    if (!this.later.has(position)) {
      this.later.add(position);
      this.reads += this.laterGrid.ids.has(position) ? 1 : 0;
      this.pending.push(["later", position]);
    }
  }

  markEarlier(position: number): void {
    if (!this.earlier.has(position)) {
      this.earlier.add(position);
      this.reads += this.earlierGrid.ids.has(position) ? 1 : 0;
      this.pending.push(["earlier", position]);
    }
  }

  /** Mark the pages that each marked page's cells are compared with, until nothing changes. */
  close(): boolean {
    for (let next = this.pending.pop(); next; next = this.pending.pop()) {
      if (this.reads > this.budget.pages) {
        return false;
      }

      const [side, position] = next;
      const own = side === "later" ? this.laterGrid : this.earlierGrid;
      const cells = own.extent(position);

      for (const pair of this.pairings) {
        const met = intersect(cells, side === "later" ? pair.later : pair.earlier);
        if (!met) {
          continue;
        }

        const sign = side === "later" ? 1 : -1;
        const other = {
          r0: met.r0 + sign * pair.rowShift,
          c0: met.c0 + sign * pair.colShift,
          r1: met.r1 + sign * pair.rowShift,
          c1: met.c1 + sign * pair.colShift,
        };
        const grid = side === "later" ? this.earlierGrid : this.laterGrid;
        for (const position of grid.overlapping(other)) {
          if (side === "later") {
            this.markEarlier(position);
          } else {
            this.markLater(position);
          }
        }
      }
    }

    this.budget.pages -= this.reads;
    return this.budget.pages >= 0;
  }
}

function sameShift(left: PageShift, right: PageShift): boolean {
  if (typeof left === "string" || typeof right === "string") {
    return left === right && left === "unpaired";
  }

  return left.rowShift === right.rowShift && left.colShift === right.colShift;
}

function storedPages(manifest: CheckpointManifest): number {
  return manifest.sheets.reduce((total, sheet) => total + sheet.pages.length, 0);
}

function everyPage(sheet: CheckpointSheet): Set<string> {
  return new Set(sheet.pages.map(([row, col]) => pageKey(row, col)));
}

/**
 * The cell pages that a compare must read so that two sparse rebuilds give
 * the same page as two whole ones. A later page is left out when every cell
 * of it is compared, through the log's axis maps, with one earlier page of
 * the same content ID and no tail writes either. Every page that a marked
 * page's cells are compared with is marked too, so a compared pair is read on
 * both sides or on neither. A sheet whose columns changed is read whole.
 *
 * Returns `undefined` when the pages to read are more than a quarter of both
 * versions' pages: the whole rebuild is then as cheap.
 */
export function selectPages(
  state: Tracking,
  earlier: CheckpointManifest,
  later: CheckpointManifest,
  earlierWrites: TailWrites,
  laterWrites: TailWrites,
): PageSelection | undefined {
  const budget = {
    pages: Math.floor((storedPages(earlier) + storedPages(later)) * MAX_PAGE_SHARE),
  };
  const earlierIndex = new Map(earlier.sheets.map((sheet, index) => [sheetId(sheet), index]));
  const earlierPages: Array<Set<string>> = earlier.sheets.map(() => new Set());
  const laterPages: Array<Set<string>> = [];

  for (const sheet of later.sheets) {
    const id = sheetId(sheet);
    const index = earlierIndex.get(id);
    const before = index === undefined ? undefined : earlier.sheets[index];
    const laterShape = { id, rowCount: sheet.rowCount, colCount: sheet.colCount };

    // A sheet new in the later version, or whose columns changed, is read whole.
    if (
      index === undefined ||
      !before ||
      JSON.stringify(before.fields.columns) !== JSON.stringify(sheet.fields.columns)
    ) {
      const whole = everyPage(sheet);
      laterPages.push(whole);
      budget.pages -= whole.size;
      if (index !== undefined && before) {
        earlierPages[index] = everyPage(before);
        budget.pages -= before.pages.length;
      }
      if (budget.pages < 0) {
        return undefined;
      }

      continue;
    }

    const earlierShape = { id, rowCount: before.rowCount, colCount: before.colCount };
    const laterGrid = new PageGrid(sheet);
    const earlierGrid = new PageGrid(before);
    const selection = new SheetSelection(
      laterGrid,
      earlierGrid,
      comparedPieces(state, laterShape, earlierShape),
      budget,
    );

    for (const rect of laterWrites.get(id) ?? []) {
      for (const position of laterGrid.overlapping(rect)) {
        selection.markLater(position);
      }
    }

    for (const rect of earlierWrites.get(id) ?? []) {
      for (const position of earlierGrid.overlapping(rect)) {
        selection.markEarlier(position);
      }
    }

    if (!selection.close()) {
      return undefined;
    }

    laterPages.push(laterGrid.stored(selection.later));
    earlierPages[index] = earlierGrid.stored(selection.earlier);
  }

  return { earlier: earlierPages, later: laterPages };
}

/** `readCheckpointCells` filter for the pages of one side of a selection. */
export function selectedPages(
  pages: ReadonlyArray<ReadonlySet<string>>,
): (sheet: number, page: CheckpointPage) => boolean {
  return (sheet, [row, col]) => pages[sheet]?.has(pageKey(row, col)) ?? false;
}

/** A detail of a page whose cell on one side needs the whole version for its calculated value. */
export interface CalculatedDetail {
  detail: HistoryDiffDetail;
  sheet: SheetId;
  row: number;
  col: number;
}

/**
 * Details of `page` whose cell on `side` holds a formula or a reference in
 * the sparse version: their calculated value can read cells that the sparse
 * version does not hold. A literal's value is the literal itself.
 */
export function calculatedDetails(
  page: HistoryDiffPage,
  side: "before" | "after",
  sparse: SheetwriteStore,
): CalculatedDetail[] {
  const engine = storeEngine(sparse);
  if (!engine) {
    throw new HistoryError("integrity", "A rebuilt version has no document engine");
  }

  const { cells } = page;
  const bySheet = new Map<SheetId, CalculatedDetail[]>();
  page.details.forEach((detail, at) => {
    const sheet = page.sheetIds[cells.sheet[at] ?? 0];
    const row = (side === "after" ? cells.row : cells.beforeRow)[at] ?? HISTORY_DIFF_NONE;
    const col = (side === "after" ? cells.col : cells.beforeCol)[at] ?? HISTORY_DIFF_NONE;
    if (sheet === undefined || row === HISTORY_DIFF_NONE) {
      return;
    }

    const list = bySheet.get(sheet) ?? [];
    list.push({ detail, sheet, row, col });
    bySheet.set(sheet, list);
  });

  const calculated: CalculatedDetail[] = [];
  for (const [sheet, list] of bySheet) {
    const sources = engine.captureCells(
      sheet,
      list.map(({ row, col }) => ({ row, col })),
    );
    list.forEach((item, at) => {
      const kind = sources[at]?.value.kind;
      if (kind === "formula" || kind === "ref") {
        calculated.push(item);
      }
    });
  }

  return calculated;
}

/** What a restore at the head reads and rewrites; see `selectRestorePages`. */
export interface RestorePages {
  /** Cell pages of the version to read, per version manifest sheet. */
  read: ReadonlyArray<ReadonlySet<string>>;
  /** Per sheet, the page rectangles where the version and the head can differ. */
  changed: ReadonlyMap<SheetId, Rect[]>;
}

/**
 * Pages where `version` and `head` can hold different cells, by position: a
 * page whose content ID differs between their checkpoints (an absent page is
 * empty), or that either log tail writes. Every other page holds the same
 * cells in both. `undefined` when a sheet is new, gone or reshaped, or when
 * more than a quarter of the version's pages would be read; the restore then
 * rebuilds the version whole.
 */
export function selectRestorePages(
  version: CheckpointManifest,
  head: CheckpointManifest,
  versionWrites: TailWrites,
  headWrites: TailWrites,
): RestorePages | undefined {
  if (version.sheets.length !== head.sheets.length) {
    return undefined;
  }

  const heads = new Map(head.sheets.map((sheet) => [sheetId(sheet), sheet]));
  let budget = Math.floor(storedPages(version) * MAX_PAGE_SHARE);
  const read: Array<Set<string>> = [];
  const changed = new Map<SheetId, Rect[]>();

  for (const sheet of version.sheets) {
    const id = sheetId(sheet);
    const current = heads.get(id);
    const reshaped =
      !current ||
      current.rowCount !== sheet.rowCount ||
      JSON.stringify(current.fields.columns) !== JSON.stringify(sheet.fields.columns);
    if (reshaped) {
      return undefined;
    }

    const grid = new PageGrid(sheet);
    const currentIds = new PageGrid(current).ids;
    const positions = new Set<number>();
    for (const position of new Set([...grid.ids.keys(), ...currentIds.keys()])) {
      if (grid.ids.get(position) !== currentIds.get(position)) {
        positions.add(position);
      }
    }
    for (const rect of [...(versionWrites.get(id) ?? []), ...(headWrites.get(id) ?? [])]) {
      for (const position of grid.overlapping(rect)) {
        positions.add(position);
      }
    }

    const pages = grid.stored(positions);
    budget -= pages.size;
    if (budget < 0) {
      return undefined;
    }

    read.push(pages);
    changed.set(
      id,
      [...positions].map((position) => {
        const cells = grid.extent(position);
        return {
          ...cells,
          r1: Math.min(cells.r1, sheet.rowCount - 1),
          c1: Math.min(cells.c1, sheet.colCount - 1),
        };
      }),
    );
  }

  return { read, changed };
}
