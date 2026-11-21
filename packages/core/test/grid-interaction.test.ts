import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { DEFAULT_THEME, GridImpl, initSheetwrite } from "../src/grid.js";
import { createGrid } from "../src/index.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellScalar, DataSourceRequest, GridEvents, Renderer, RowData } from "../src/types.js";
import { coveredPage, makeWorkbook, mountHost, scrollerOf } from "./fixtures.js";

const originalRaf = globalThis.requestAnimationFrame;
let restoreStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();

  // Make scheduled renders run synchronously so a resize's repaint is observable
  // without racing a real animation-frame timer.
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});

afterEach(() => {
  restoreStubs();
  globalThis.requestAnimationFrame = originalRaf;
});

const WINDOWED_DATASOURCE = { protocol: 2, columns: "windowed" } as const;

/** A 1,000-row paged sheet of one column with a frozen row and a 64-byte clean cache. */
function mountPagedNameColumn() {
  const workbook = makeWorkbook(1_000);
  const sheet = workbook.sheets[0];
  if (!sheet) throw new Error("expected fixture sheet");
  sheet.columns = sheet.columns.slice(0, 1);
  sheet.frozenRows = 1;
  const host = mountHost();
  const grid = createGrid(host, {
    workbook,
    overscan: 0,
    datasourceStorage: { mode: "paged", chunkRows: 4, cacheBytes: 64 },
  });
  const store = grid.store;
  if (!(store instanceof SheetwriteStore)) throw new Error("expected public paged store");
  return { host, grid, store };
}

function requestColumnIndices(request: DataSourceRequest): number[] {
  const indices: number[] = [];
  for (const band of request.columns) {
    for (let column = band.start; column < band.end; column++) indices.push(column);
  }
  return indices;
}

/** A renderer that records the values of each paint. */
function makePaintRecorder(): Renderer & { readonly paints: CellScalar[][] } {
  const paints: CellScalar[][] = [];
  return {
    paints,
    mount() {},
    setLayout() {},
    setViewport() {},
    paint(view) {
      paints.push(Array.from(view.values));
    },
    setTheme() {},
    setRenderers() {},
    destroy() {},
  };
}

describe("paged formula closures and residency", () => {
  it.each(["frozen", "merge"] as const)(
    "loads the formula closure of a visible %s anchor",
    async (rootKind) => {
      const workbook = makeWorkbook(1_000);
      const sheet = workbook.sheets[0];
      if (!sheet) throw new Error("expected fixture sheet");
      sheet.columns = Array.from({ length: 20 }, (_, column) => ({
        key: `c${column}`,
        header: `C${column}`,
        width: 100,
        type: "number" as const,
      }));
      const rootRow = rootKind === "frozen" ? 0 : 50;
      if (rootKind === "frozen") sheet.frozenRows = 1;
      else sheet.merges = [{ r0: rootRow, c0: 0, r1: 220, c1: 0 }];
      const requests: DataSourceRequest[] = [];
      const host = mountHost();
      const grid = createGrid(host, {
        workbook,
        overscan: 0,
        datasourceStorage: { mode: "paged", chunkRows: 4, cacheBytes: 1024 * 1024 },
        datasource: {
          capabilities: WINDOWED_DATASOURCE,
          getRows: async (request) => {
            requests.push(request);
            return coveredPage(
              request,
              Array.from({ length: request.end - request.start }, (_, offset) => {
                const row = request.start + offset;
                const values: RowData = {};
                for (let column = 0; column < 20; column++) {
                  values[`c${column}`] =
                    row === rootRow && column === 0
                      ? { kind: "formula", src: "=T901+1" }
                      : row === 900 && column === 19
                        ? 41
                        : row;
                }
                return values;
              }),
            );
          },
        },
      });
      try {
        const store = grid.store;
        if (!(store instanceof SheetwriteStore)) throw new Error("expected public paged store");
        // Only the off-screen dependency is missing, not the source formula.
        store.loadPage(
          "s1",
          rootRow,
          [{ start: 0, end: 1, keys: ["c0"] }],
          [{ c0: { kind: "formula", src: "=T901+1" } }],
        );
        const scroller = scrollerOf(host);
        scroller.scrollTop = 200 * DEFAULT_THEME.rowHeight;
        scroller.dispatchEvent(new Event("scroll"));
        for (let turn = 0; turn < 64; turn++) await Promise.resolve();

        expect(
          requests.some(
            (request) =>
              request.start <= 900 &&
              request.end > 900 &&
              requestColumnIndices(request).includes(19),
          ),
        ).toBe(true);
        expect(grid.store.getCell({ sheet: "s1", row: rootRow, col: 0 }).resolved).toBe(42);
        expect(store.getCellLoadState({ sheet: "s1", row: 900, col: 19 })).toBe("loaded-value");
      } finally {
        grid.destroy();
      }
    },
  );

  it("keeps viewport chunks resident across disjoint bulk reads and releases both pin lifetimes", () => {
    const { host, grid, store } = mountPagedNameColumn();
    try {
      const scroller = scrollerOf(host);
      scroller.scrollTop = 100 * DEFAULT_THEME.rowHeight;
      scroller.dispatchEvent(new Event("scroll"));
      const columns = [{ start: 0, end: 1, keys: ["name"] }];
      store.loadPage("s1", 0, columns, [{ name: "frozen" }]);
      store.loadPage("s1", 100, columns, [{ name: "visible" }]);
      expect(store.getCell({ sheet: "s1", row: 100, col: 0 }).resolved).toBe("visible");
      for (const row of [400, 500, 600, 700]) {
        store.getVisibleWindow("s1", { start: row, end: row + 1 }, [0]);
        store.loadPage("s1", row, columns, [{ name: `bulk-${row}` }]);
        expect(store.getCell({ sheet: "s1", row: 100, col: 0 }).resolved).toBe("visible");
        expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("frozen");
      }
      expect(store.getCellLoadState({ sheet: "s1", row: 400, col: 0 })).toBe("unloaded");
      grid.addSheet({ id: "other", name: "Other", rowCount: 1 });
      grid.setActiveSheet("other");
      store.loadPage("s1", 800, columns, [{ name: "after-switch" }]);
      expect(store.getCellLoadState({ sheet: "s1", row: 0, col: 0 })).toBe("unloaded");
      expect(store.getCellLoadState({ sheet: "s1", row: 100, col: 0 })).toBe("unloaded");
      grid.setActiveSheet("s1");
      grid.removeSheet("s1");
      expect(grid.getActiveSheet()).toBe("other");
    } finally {
      grid.destroy();
    }
  });
  it("retains a visible formula dependency closure under clean-cache pressure", () => {
    const { grid, store } = mountPagedNameColumn();
    try {
      const columns = [{ start: 0, end: 1, keys: ["name"] }];
      store.loadPage("s1", 0, columns, [{ name: { kind: "formula", src: "=A901+1" } }]);
      store.loadPage("s1", 900, columns, [{ name: 41 }]);
      grid.setOverscan(1);
      for (const row of [400, 500, 600, 700]) {
        store.loadPage("s1", row, columns, [{ name: row }]);
      }
      expect(store.getCellLoadState({ sheet: "s1", row: 900, col: 0 })).toBe("loaded-value");
      expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(42);
    } finally {
      grid.destroy();
    }
  });
});

describe("datasource repaint invalidation", () => {
  it("loads the off-screen cells that visible formulas read", async () => {
    const columnCount = 20;
    const workbook = makeWorkbook(1_000);
    workbook.sheets[0]!.columns = Array.from({ length: columnCount }, (_, column) => ({
      key: `c${column}`,
      header: `C${column}`,
      width: 100,
      type: "number" as const,
    }));
    const host = mountHost();
    const grid = new GridImpl(host, {
      workbook,
      datasourceStorage: { mode: "paged" },
      datasource: {
        capabilities: WINDOWED_DATASOURCE,
        // Column A holds the row index; every other column doubles it.
        getRows: (request) =>
          Promise.resolve(
            coveredPage(
              request,
              Array.from({ length: request.end - request.start }, (_, offset) => {
                const row = request.start + offset;
                const values: RowData = { c0: row };
                for (let column = 1; column < columnCount; column++) {
                  values[`c${column}`] = { kind: "formula", src: `=A${row + 1}*2` };
                }
                return values;
              }),
            ),
          ),
      },
    });
    const recorder = makePaintRecorder();
    Reflect.set(grid, "renderer", recorder);
    let scrollEvent: GridEvents["scroll"] | undefined;
    grid.on("scroll", (event) => {
      scrollEvent = event;
    });

    // Scroll right past column A and down past the first loaded rows at once.
    const scrollTop = 4_000;
    const scroller = scrollerOf(host);
    scroller.scrollLeft = 1_200;
    scroller.scrollTop = scrollTop;
    scroller.dispatchEvent(new Event("scroll"));
    // Pages resolve as microtasks and renders run synchronously, so the
    // viewport page, the formula-read page, and their repaints settle here.
    for (let turn = 0; turn < 32; turn++) await Promise.resolve();

    if (!scrollEvent) throw new Error("scroll event was not emitted");
    const column = scrollEvent.firstVisibleColumn;
    if (column === null) throw new Error("no column is visible");
    expect(column).toBeGreaterThan(4);
    // The scroll event includes overscan rows; check the rows on screen.
    const { rowHeight, headerHeight } = DEFAULT_THEME;
    const firstOnScreen = Math.floor(scrollTop / rowHeight);
    const lastOnScreen = Math.floor((scrollTop + host.clientHeight - headerHeight - 1) / rowHeight);
    const lastPaint = recorder.paints.at(-1) ?? [];
    for (let row = firstOnScreen; row <= lastOnScreen; row++) {
      expect(grid.store.getCell({ sheet: "s1", row, col: column }).resolved).toBe(row * 2);
      expect(lastPaint).toContain(row * 2);
    }
    grid.destroy();
  });

  it("hydrates off-screen spill destinations before repainting a paged array", async () => {
    const spillRows = 400;
    const workbook = makeWorkbook(1_000);
    const sheet = workbook.sheets[0];
    if (!sheet) throw new Error("workbook fixture has no sheet");
    sheet.columns = [{ key: "spill", header: "Spill", width: 100, type: "number" }];
    const requests: DataSourceRequest[] = [];
    const grid = new GridImpl(mountHost(), {
      workbook,
      datasourceStorage: { mode: "paged" },
      datasource: {
        capabilities: WINDOWED_DATASOURCE,
        getRows: (request) => {
          requests.push(request);
          return Promise.resolve(
            coveredPage(
              request,
              Array.from({ length: request.end - request.start }, (_, offset): RowData => ({
                spill:
                  request.start + offset === 0
                    ? { kind: "formula", src: `=SEQUENCE(${spillRows})` }
                    : { kind: "literal", value: null },
              })),
            ),
          );
        },
      },
    });
    const recorder = makePaintRecorder();
    Reflect.set(grid, "renderer", recorder);
    try {
      for (let turn = 0; turn < 32; turn++) await Promise.resolve();
      const firstRequest = requests[0];
      if (!firstRequest) throw new Error("viewport request was not issued");
      expect(firstRequest.end).toBeLessThan(spillRows);
      expect(requests.some((request) => request.end >= spillRows)).toBe(true);
      expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(1);
      expect(grid.store.getCell({ sheet: "s1", row: spillRows - 1, col: 0 }).resolved).toBe(
        spillRows,
      );
      expect(recorder.paints.at(-1)).toContain(1);
    } finally {
      grid.destroy();
    }
  });
});

describe("scroll into view", () => {
  const VIEW_WIDTH = 720;
  const VIEW_HEIGHT = 400;

  interface Layout {
    widths: number[];
    rowCount?: number;
    heights?: Map<number, number>;
    frozenCols?: number;
    frozenRows?: number;
    hiddenCols?: number[];
    hiddenRows?: number[];
    zoom?: number;
  }

  /** A 720 × 400 px grid of `layout`, with its edges in zoomed content pixels. */
  function mountLayout(layout: Layout) {
    const rowCount = layout.rowCount ?? 200;
    const workbook = makeWorkbook(rowCount);
    const sheet = workbook.sheets[0];
    if (!sheet) throw new Error("expected fixture sheet");
    const hiddenCols = new Set(layout.hiddenCols);
    sheet.columns = layout.widths.map((width, col) => ({
      key: `c${col}`,
      header: `C${col}`,
      width,
      type: "text" as const,
      ...(hiddenCols.has(col) ? { visible: false } : {}),
    }));
    sheet.rowHeights = layout.heights;
    sheet.hiddenRows = new Set(layout.hiddenRows);
    sheet.frozenCols = layout.frozenCols;
    sheet.frozenRows = layout.frozenRows;
    const host = mountHost();
    const grid = createGrid(host, { workbook });
    const scroller = scrollerOf(host);
    for (const element of [host.querySelector(".sheetwrite-viewport"), scroller]) {
      if (!element) throw new Error("expected grid viewport");
      Object.defineProperty(element, "clientWidth", { value: VIEW_WIDTH, configurable: true });
      Object.defineProperty(element, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
    }
    // Lay out again at the stubbed size.
    grid.setTheme({});
    const zoom = layout.zoom ?? 1;
    grid.setZoom(zoom);
    const columnLefts: number[] = [];
    let x = 0;
    for (const [col, width] of layout.widths.entries()) {
      columnLefts.push(x);
      if (!hiddenCols.has(col)) x += width * zoom;
    }
    columnLefts.push(x);
    // View rows skip hidden sheet rows; scrollToCell counts rows in the view.
    const hiddenRows = new Set(layout.hiddenRows);
    const rowTops: number[] = [];
    let y = 0;
    for (let row = 0; row < rowCount; row++) {
      if (hiddenRows.has(row)) continue;
      rowTops.push(y);
      y += (layout.heights?.get(row) ?? DEFAULT_THEME.rowHeight) * zoom;
    }
    rowTops.push(y);
    const frozenWidth = columnLefts[layout.frozenCols ?? 0] ?? 0;
    const frozenHeight = rowTops[layout.frozenRows ?? 0] ?? 0;
    const sizer = host.querySelector<HTMLElement>(".sheetwrite-sizer");
    if (!sizer) throw new Error("expected grid sizer");
    return {
      grid,
      scroller,
      maxScroll: () => ({
        left: Number.parseFloat(sizer.style.width) - VIEW_WIDTH,
        top: Number.parseFloat(sizer.style.height) - VIEW_HEIGHT,
      }),
      /** The scroll that shows column `col` whole with the first body column on its gridline. */
      snappedLeft(col: number): number {
        const body = VIEW_WIDTH - DEFAULT_THEME.rowHeaderWidth * zoom - frozenWidth;
        return snap(
          columnLefts.slice(layout.frozenCols ?? 0),
          columnLefts[col]!,
          layout.widths[col]! * zoom,
          body,
          frozenWidth,
        );
      },
      /** The scroll that shows view row `row` whole with the first body row on its gridline. */
      snappedTop(row: number): number {
        const body = VIEW_HEIGHT - DEFAULT_THEME.headerHeight * zoom - frozenHeight;
        return snap(
          rowTops.slice(layout.frozenRows ?? 0),
          rowTops[row]!,
          rowTops[row + 1]! - rowTops[row]!,
          body,
          frozenHeight,
        );
      },
    };
  }

  /**
   * The scroll that shows the span at `start`, `size` long, whole in a body
   * `body` long after `frozen` pinned pixels: the least edge past the
   * overflow, or the span's own start when it is longer than the body.
   */
  function snap(
    edges: number[],
    start: number,
    size: number,
    body: number,
    frozen: number,
  ): number {
    const need = start + size - body;
    const edge = edges.find((candidate) => candidate >= need) ?? start;
    return Math.min(start, edge) - frozen;
  }

  const WIDTHS = Array.from({ length: 30 }, (_, col) => 70 + ((col * 37) % 90));
  const LAYOUTS: Array<[string, Layout]> = [
    ["plain", { widths: WIDTHS }],
    [
      "frozen panes, hidden columns and rows, mixed heights at 150%",
      {
        widths: WIDTHS,
        heights: new Map(Array.from({ length: 200 }, (_, row) => [row, 20 + ((row * 13) % 30)])),
        frozenCols: 2,
        frozenRows: 1,
        hiddenCols: [9, 10],
        hiddenRows: [30, 31, 32],
        zoom: 1.5,
      },
    ],
    ["50% zoom", { widths: [...WIDTHS, ...WIDTHS], zoom: 0.5 }],
    ["200% zoom", { widths: WIDTHS, zoom: 2 }],
    ["a column wider than the view", { widths: [100, 120, 2_000, 90, 90] }],
  ];

  for (const [name, layout] of LAYOUTS) {
    it(`stops on a column and row boundary going right and down: ${name}`, () => {
      const view = mountLayout(layout);
      const col = layout.widths.length - 3;
      const row = 120;
      try {
        view.grid.scrollToCell({ sheet: "s1", row, col });
        expect(view.scroller.scrollLeft).toBe(view.snappedLeft(col));
        expect(view.scroller.scrollTop).toBe(view.snappedTop(row));
      } finally {
        view.grid.destroy();
      }
    });
  }

  it("leaves room to stop on a boundary at the last column and row", () => {
    // The docs Report sheet's seven columns, 808 px, in a 720 px grid, with
    // the two 100 px empty columns an 800 px host pads a spreadsheet with.
    const view = mountLayout({
      widths: [96, 112, 104, 104, 96, 88, 208, 100, 100],
      rowCount: 24,
      heights: new Map([
        [0, 44],
        [2, 48],
        [3, 48],
        [4, 48],
        [5, 48],
      ]),
    });
    try {
      view.grid.scrollToCell({ sheet: "s1", row: 2, col: 6 });
      // Column C (208 px) starts the body, not the end of column B's "Manager".
      expect(view.snappedLeft(6)).toBe(208);
      expect(view.scroller.scrollLeft).toBe(208);
      view.grid.scrollToCell({ sheet: "s1", row: 23, col: 8 });
      expect(view.scroller.scrollLeft).toBe(view.snappedLeft(8));
      expect(view.scroller.scrollTop).toBe(view.snappedTop(23));
      expect(view.maxScroll()).toEqual({ left: view.snappedLeft(8), top: view.snappedTop(23) });
    } finally {
      view.grid.destroy();
    }
  });
});
