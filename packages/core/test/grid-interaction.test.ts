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
