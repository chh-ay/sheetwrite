import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { DEFAULT_THEME, GridImpl, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { ColumnarData, Workbook } from "../src/types.js";

// A 40-row sheet whose odd data rows match "hit" and whose rank column reverses
// the view order when sorted ascending. The expectations below are derived from
// the fixture alone: a match on data row r sits at y = headerHeight + r *
// rowHeight - scrollTop, and the paint order is match order.
const ROW_COUNT = 40;
const COL_WIDTH = 120;
const ROW_HEIGHT = DEFAULT_THEME.rowHeight;
const HEADER_HEIGHT = DEFAULT_THEME.headerHeight;
const ROW_HEADER_WIDTH = DEFAULT_THEME.rowHeaderWidth;
/** Data rows 1, 3, ..., 13 are on screen at the top of the sheet. */
const TOP_MATCH_TOPS = [60, 116, 172, 228, 284, 340, 396];

let restoreStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs({ width: 800, height: 400 });
});

afterEach(() => {
  restoreStubs();
  document.body.replaceChildren();
});

function fixture(): { workbook: Workbook; data: ColumnarData } {
  const hits: string[] = new Array(ROW_COUNT);
  const bucket: string[] = new Array(ROW_COUNT);
  const rank = new Float64Array(ROW_COUNT);
  for (let row = 0; row < ROW_COUNT; row++) {
    hits[row] = row % 2 === 1 ? `hit-${row}` : `miss-${row}`;
    bucket[row] = row % 4 === 0 ? "keep" : "drop";
    rank[row] = ROW_COUNT - row;
  }
  return {
    workbook: {
      activeSheet: "s1",
      sheets: [
        {
          id: "s1",
          name: "Sheet 1",
          rowCount: ROW_COUNT,
          columns: [
            { key: "hits", header: "Hits", width: COL_WIDTH, type: "text" },
            { key: "bucket", header: "Bucket", width: 90, type: "text" },
            { key: "rank", header: "Rank", width: 80, type: "number" },
          ],
        },
      ],
    },
    data: { rowCount: ROW_COUNT, columns: { hits, bucket, rank } },
  };
}

interface PaintedRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly outlineColor: string;
  readonly clipPath: string;
}

function stylePx(value: string): number {
  return value === "" ? 0 : Number.parseFloat(value);
}

/** The overlay rects a viewer can actually see, in paint order. */
function paintedRects(host: HTMLElement): PaintedRect[] {
  const overlay = host.querySelector(".sheetwrite-overlay");
  if (!(overlay instanceof HTMLElement)) throw new Error("expected grid overlay");
  const rects: PaintedRect[] = [];
  for (const child of overlay.children) {
    if (!(child instanceof HTMLElement)) continue;
    const style = child.style;
    if (style.display === "none") continue;
    rects.push({
      left: stylePx(style.left),
      top: stylePx(style.top),
      width: stylePx(style.width),
      height: stylePx(style.height),
      background: style.background,
      outlineColor: style.outlineColor,
      clipPath: style.clipPath,
    });
  }
  return rects;
}

/** Screen top of data row `row` for a uniform 28px row grid. */
function bodyTop(row: number, contentTop: number): number {
  return HEADER_HEIGHT + row * ROW_HEIGHT - contentTop;
}

function mountGrid(): { grid: GridImpl; host: HTMLDivElement; scroller: HTMLDivElement } {
  const { workbook, data } = fixture();
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  const grid = new GridImpl(host, {
    workbook,
    data,
    overscan: 0,
    config: { toolbar: false, contextMenu: false, find: false },
  });
  const scroller = host.querySelector(".sheetwrite-scroller");
  if (!(scroller instanceof HTMLDivElement)) throw new Error("expected grid scroller");
  return { grid, host, scroller };
}

function topsOf(host: HTMLElement): number[] {
  return paintedRects(host).map((rect) => rect.top);
}

function activeOutlineTops(host: HTMLElement): number[] {
  return paintedRects(host)
    .filter((rect) => rect.outlineColor === DEFAULT_THEME.searchActiveMatch)
    .map((rect) => rect.top);
}

describe("search highlights follow the active view", () => {
  it("paints only the visible matches with the match fill", () => {
    const { grid, host } = mountGrid();

    grid.search("hit");
    grid.refresh();

    const rects = paintedRects(host);
    expect(rects.map((rect) => rect.top)).toEqual(TOP_MATCH_TOPS);
    expect(rects.every((rect) => rect.left === ROW_HEADER_WIDTH)).toBe(true);
    expect(rects.every((rect) => rect.width === COL_WIDTH)).toBe(true);
    expect(rects.every((rect) => rect.height === ROW_HEIGHT)).toBe(true);
    expect(rects.every((rect) => rect.background === DEFAULT_THEME.searchMatch)).toBe(true);
    grid.destroy();
  });

  it("moves highlights with the scroll offset", () => {
    const { grid, host, scroller } = mountGrid();
    grid.search("hit");

    scroller.scrollTop = 7 * ROW_HEIGHT;
    grid.refresh();

    // View rows 7..20: the odd ones are data rows 7, 9, ..., 19.
    expect(topsOf(host)).toEqual(
      [7, 9, 11, 13, 15, 17, 19].map((row) => bodyTop(row, 7 * ROW_HEIGHT)),
    );
    grid.destroy();
  });

  it("re-maps every highlight when a sort reverses the view", () => {
    const { grid, host } = mountGrid();
    grid.search("hit");
    grid.refresh();

    // rank is ROW_COUNT - row, so ascending view order starts at data row 39:
    // view row v holds data row 39 - v, and every even view row is a match.
    // Match order is data-row order, which the reversed view paints last-first.
    grid.sortBy(2, true);
    grid.refresh();
    expect(topsOf(host)).toEqual([368, 312, 256, 200, 144, 88, 32]);

    // A second sort of the same length restores the identity view.
    grid.sortBy(2, false);
    grid.refresh();
    expect(topsOf(host)).toEqual(TOP_MATCH_TOPS);
    grid.destroy();
  });

  it("re-maps every highlight when a filter replaces the previous one", () => {
    const { grid, host } = mountGrid();
    grid.search("hit");
    grid.refresh();

    // Every "keep" row is even, so no match survives the filter.
    grid.filterBy(1, "keep");
    grid.refresh();
    expect(paintedRects(host)).toEqual([]);

    // "drop" keeps all but the multiples of four, so data row 1 is view row 0,
    // row 3 view row 2, row 5 view row 3, and so on up to view row 13.
    grid.filterBy(1, "drop");
    grid.refresh();
    expect(topsOf(host)).toEqual([32, 88, 116, 172, 200, 256, 284, 340, 368]);

    // Filtering by the match text leaves only odd rows, one per view row.
    grid.filterBy(0, "hit");
    grid.refresh();
    expect(topsOf(host)).toEqual([
      32, 60, 88, 116, 144, 172, 200, 228, 256, 284, 312, 340, 368, 396,
    ]);

    grid.clearView();
    grid.refresh();
    expect(topsOf(host)).toEqual(TOP_MATCH_TOPS);
    grid.destroy();
  });

  it("keeps pinned-row highlights pinned and scrolls the body highlights under them", () => {
    const { grid, host, scroller } = mountGrid();
    grid.setFrozen(1, 0);
    grid.search("hit");

    scroller.scrollTop = 5 * ROW_HEIGHT;
    grid.refresh();

    // Frozen view row 0 is even (no match); the body paints view rows 6..18.
    expect(topsOf(host)).toEqual([7, 9, 11, 13, 15, 17].map((row) => bodyTop(row, 5 * ROW_HEIGHT)));
    grid.destroy();
  });

  it("repaints highlights at the new offsets after a row height change", () => {
    const { grid, host } = mountGrid();
    grid.search("hit");
    grid.refresh();

    grid.setRowHeight(1, 56);
    grid.refresh();

    // Row 1 grows by 28px, so every later match sits 28px lower.
    const rects = paintedRects(host);
    expect(rects[0]?.top).toBe(bodyTop(1, 0));
    expect(rects[0]?.height).toBe(56);
    expect(rects[1]?.top).toBe(144);
    expect(rects[2]?.top).toBe(200);
    grid.destroy();
  });

  it("moves the active-match outline with findNext", () => {
    const { grid, host } = mountGrid();
    grid.search("hit");
    grid.refresh();

    // The first match at or below the viewport is data row 1.
    expect(activeOutlineTops(host)).toEqual([bodyTop(1, 0)]);

    grid.findNext();
    grid.refresh();
    expect(activeOutlineTops(host)).toEqual([bodyTop(3, 0)]);

    grid.findPrev();
    grid.refresh();
    expect(activeOutlineTops(host)).toEqual([bodyTop(1, 0)]);
    grid.destroy();
  });

  it("keeps every search match on a partly scrolled-off top row", () => {
    const { grid, host, scroller } = mountGrid();
    // Data row 5 already matches in its first column; add a second match beside it.
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 5, col: 1 },
          value: { kind: "literal", value: "hit-b" },
        },
      ],
    });
    grid.search("hit");

    // Row 5 is still half visible at the top of the body.
    const scrollTop = 5 * ROW_HEIGHT + ROW_HEIGHT / 2;
    scroller.scrollTop = scrollTop;
    grid.refresh();

    // Both rects of row 5 are clipped to the top of the body: half a row tall.
    const clipped = paintedRects(host).filter((rect) => rect.top === HEADER_HEIGHT);
    expect(clipped.map((rect) => rect.height)).toEqual([ROW_HEIGHT / 2, ROW_HEIGHT / 2]);
    expect(clipped.map((rect) => rect.left)).toEqual([
      ROW_HEADER_WIDTH,
      ROW_HEADER_WIDTH + COL_WIDTH,
    ]);
    grid.destroy();
  });
});

describe("note indicators follow the active view", () => {
  it("paints a note marker on its row and drops it once the row scrolls away", () => {
    const { grid, host, scroller } = mountGrid();
    grid.setNote({ sheet: "s1", row: 5, col: 0 }, "check");

    grid.refresh();
    const atTop = paintedRects(host);
    expect(atTop).toHaveLength(1);
    expect(atTop[0]?.top).toBe(bodyTop(5, 0));
    const marker = atTop[0];
    if (!marker) throw new Error("Expected a visible note marker");
    expect(marker.left).toBeGreaterThanOrEqual(ROW_HEADER_WIDTH);
    expect(marker.width).toBeGreaterThan(0);
    expect(marker.width).toBeLessThan(COL_WIDTH);
    expect(marker.left + marker.width).toBeLessThanOrEqual(ROW_HEADER_WIDTH + COL_WIDTH);
    expect(marker.height).toBeGreaterThan(0);
    expect(marker.height).toBeLessThanOrEqual(ROW_HEIGHT);

    scroller.scrollTop = 8 * ROW_HEIGHT;
    grid.refresh();
    expect(paintedRects(host)).toEqual([]);
    grid.destroy();
  });

  it("moves a note marker when the note is re-added on another row", () => {
    const { grid, host } = mountGrid();
    grid.setNote({ sheet: "s1", row: 5, col: 0 }, "check");
    grid.refresh();
    expect(topsOf(host)).toEqual([bodyTop(5, 0)]);

    grid.setNote({ sheet: "s1", row: 5, col: 0 }, null);
    grid.setNote({ sheet: "s1", row: 9, col: 0 }, "moved");
    grid.refresh();
    expect(topsOf(host)).toEqual([bodyTop(9, 0)]);
    grid.destroy();
  });

  it("keeps a pinned-row note marker on its row while the body scrolls", () => {
    const { grid, host, scroller } = mountGrid();
    grid.setFrozen(1, 0);
    grid.setNote({ sheet: "s1", row: 0, col: 0 }, "pinned");
    grid.setNote({ sheet: "s1", row: 20, col: 0 }, "body");

    scroller.scrollTop = 19 * ROW_HEIGHT;
    grid.refresh();

    expect(topsOf(host)).toEqual([HEADER_HEIGHT, bodyTop(20, 19 * ROW_HEIGHT)]);
    grid.destroy();
  });
});
