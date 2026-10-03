import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { DEFAULT_THEME, GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type {
  CellScalar,
  DataSourcePage,
  DataSourceRequest,
  GridEvents,
  Renderer,
  RenderLayout,
  RowData,
  Viewport,
} from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

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

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

const WINDOWED_DATASOURCE = { protocol: 2, columns: "windowed" } as const;

function coveredRow(request: DataSourceRequest, values: RowData): RowData {
  const row: RowData = {};
  for (const band of request.columns) {
    for (const key of band.keys) row[key] = values[key] ?? null;
  }
  return row;
}

function coveredPage(request: DataSourceRequest, rows: RowData[]): DataSourcePage {
  return {
    protocol: 2,
    start: request.start,
    columns: request.columns,
    rows: rows.map((row) => coveredRow(request, row)),
  };
}

function requestColumnIndices(request: DataSourceRequest): number[] {
  const indices: number[] = [];
  for (const band of request.columns) {
    for (let column = band.start; column < band.end; column++) indices.push(column);
  }
  return indices;
}

function scrollerOf(host: HTMLElement): HTMLDivElement {
  const node = host.querySelector(".sheetwrite-scroller");
  if (!(node instanceof HTMLDivElement)) throw new Error("expected grid scroller");
  return node;
}

describe("find-bar keystroke isolation", () => {
  // Contract: keydowns whose target is an editable widget (the find bar's
  // <input>) inside the host must be ignored by the grid's key handler. Before
  // the fix a printable key started a cell edit and Backspace destructively
  // cleared the selected cell.
  it("does not clear the selected cell when Backspace is pressed in the find input", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    const addr = { sheet: "s1", row: 3, col: 0 };

    grid.setSelection({ kind: "cell", addr });

    host.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));
    const findInput = host.querySelector(".sheetwrite-find-input");
    if (!(findInput instanceof HTMLInputElement)) throw new Error("find input not mounted");

    findInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));

    // Pre-fix: Backspace fell through to the grid and ran clearSelection(),
    // nulling the cell under the selection.
    expect(store.getCell(addr).resolved).toBe("Customer 3");

    grid.destroy();
  });
});

interface PaintRecorder extends Renderer {
  readonly paints: Array<{ rowHeights: number[] | null; values: CellScalar[] }>;
  readonly layouts: Array<RenderLayout["merges"]>;
}

function makePaintRecorder(): PaintRecorder {
  let lastViewport: Viewport | null = null;
  const paints: Array<{ rowHeights: number[] | null; values: CellScalar[] }> = [];
  const layouts: Array<RenderLayout["merges"]> = [];
  return {
    paints,
    layouts,
    mount() {},
    setLayout(layout) {
      layouts.push(layout.merges?.map((merge) => ({ ...merge })));
    },
    setViewport(viewport: Viewport) {
      lastViewport = viewport;
    },
    paint(view) {
      paints.push({
        rowHeights: lastViewport?.rowHeights ? Array.from(lastViewport.rowHeights) : null,
        values: Array.from(view.values),
      });
    },
    setTheme() {},
    setRenderers() {},
    destroy() {},
  };
}

describe("row-resize repaint invalidation", () => {
  // Contract: a row-height change via the row-header drag path must force the
  // next render to issue a fresh Renderer.paint carrying the new per-row
  // geometry. Before the fix the paint signature ignored the resize, so the
  // canvas stayed stale until an unrelated interaction repainted it.
  //
  // A 5-row sheet keeps every row inside the render window regardless of height,
  // so the paint signature's window/scroll/store components are all invariant
  // across the resize. The only way a repaint can fire is the row-height epoch
  // the fix bumps — which gives this test teeth against the pre-fix behavior.
  it("repaints with the new row height after a row-header drag", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    const recorder = makePaintRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);
    // Construction's paint went to the real renderer; the recorder starts clean.
    expect(recorder.paints.length).toBe(0);

    const scroller = scrollerOf(host);
    // The row-0/row-1 boundary sits at content-Y === rowHeight, inside the left
    // row-header gutter (x < rowHeaderWidth).
    const boundaryY = DEFAULT_THEME.headerHeight + DEFAULT_THEME.rowHeight;
    scroller.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 10,
        clientY: boundaryY,
        button: 0,
        bubbles: true,
      }),
    );
    // Drag down 30px: row 0 grows 28 -> 58.
    scroller.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 10, clientY: boundaryY + 30, bubbles: true }),
    );
    scroller.dispatchEvent(
      new PointerEvent("pointerup", { clientX: 10, clientY: boundaryY + 30, bubbles: true }),
    );

    // Pre-fix: no signature component changed, so paint() was skipped entirely.
    expect(recorder.paints.length).toBeGreaterThan(0);
    // The forced repaint carried the resized geometry into the frame.
    expect(recorder.paints.at(-1)?.rowHeights?.[0]).toBe(58);

    grid.destroy();
  });
});

describe("merge repaint invalidation", () => {
  it("keeps merge metadata and selection unchanged in read-only mode", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, readOnly: true }, store);
    const selection = {
      kind: "range" as const,
      range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 2, col: 1 } },
    };

    grid.setSelection(selection);
    const originalMerges = workbook.sheets[0]?.merges?.map((merge) => ({ ...merge })) ?? [];
    grid.actions.merge();

    expect(workbook.sheets[0]?.merges ?? []).toEqual(originalMerges);
    expect(grid.getSelection()).toEqual(selection);
    grid.destroy();

    const mergedWorkbook = makeWorkbook(10);
    mergedWorkbook.sheets[0]!.merges = [{ r0: 1, c0: 0, r1: 2, c1: 1 }];
    const mergedStore = new SheetwriteStore(mergedWorkbook, makeColumnarData(10));
    const mergedHost = mountHost();
    const mergedGrid = new GridImpl(
      mergedHost,
      { workbook: mergedWorkbook, readOnly: true },
      mergedStore,
    );
    const coveredCell = {
      kind: "cell" as const,
      addr: { sheet: "s1", row: 2, col: 1 },
    };
    mergedGrid.setSelection(coveredCell);
    mergedGrid.actions.unmerge();

    expect(mergedWorkbook.sheets[0]?.merges).toEqual([{ r0: 1, c0: 0, r1: 2, c1: 1 }]);
    expect(mergedGrid.getSelection()).toEqual(coveredCell);
    mergedGrid.destroy();
  });
});
describe("datasource repaint invalidation", () => {
  it("paints loaded values when an async page resolves without another interaction", async () => {
    const { promise, resolve } = Promise.withResolvers<DataSourcePage>();
    let requested: DataSourceRequest | undefined;
    const workbook = makeWorkbook(20);
    const host = mountHost();
    const grid = new GridImpl(host, {
      workbook,
      datasource: {
        capabilities: WINDOWED_DATASOURCE,
        getRows: (request) => {
          if (requested) {
            return Promise.resolve(
              coveredPage(
                request,
                Array.from({ length: request.end - request.start }, (_, row) => ({
                  name: `Loaded ${request.start + row}`,
                  amount: request.start + row,
                  city: "Tokyo",
                })),
              ),
            );
          }
          requested = request;
          return promise;
        },
      },
    });
    const recorder = makePaintRecorder();
    const errors: GridEvents["datasource-error"][] = [];
    grid.on("datasource-error", (event) => errors.push(event));
    Reflect.set(grid, "renderer", recorder);

    if (!requested) throw new Error("datasource request was not issued");
    const viewportRequest = requested;
    resolve(
      coveredPage(
        viewportRequest,
        Array.from({ length: viewportRequest.end - viewportRequest.start }, (_, row) => ({
          name: `Loaded ${viewportRequest.start + row}`,
          amount: viewportRequest.start + row,
          city: "Tokyo",
        })),
      ),
    );
    await promise;
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => resolveFrame());
    });
    await Promise.resolve();

    expect(errors).toEqual([]);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Loaded 0");

    expect(recorder.paints.some((paint) => paint.values.includes("Loaded 0"))).toBe(true);
    grid.destroy();
  });

  it("demands hidden-safe frozen and overscanned far columns on horizontal scroll", () => {
    const workbook = makeWorkbook(100);
    const sheet = workbook.sheets[0]!;
    sheet.columns = Array.from({ length: 20 }, (_, column) => ({
      key: `c${column}`,
      header: `C${column}`,
      width: 100,
      type: "text" as const,
      visible: column === 1 ? false : undefined,
    }));
    sheet.frozenCols = 1;
    const requests: DataSourceRequest[] = [];
    const { promise } = Promise.withResolvers<DataSourcePage>();
    const host = mountHost();
    const grid = new GridImpl(host, {
      workbook,
      overscan: 1,
      datasource: {
        capabilities: WINDOWED_DATASOURCE,
        getRows: (request) => {
          requests.push(request);
          return promise;
        },
      },
    });
    const recorder = makePaintRecorder();
    Reflect.set(grid, "renderer", recorder);
    requests.length = 0;
    let scrollEvent: GridEvents["scroll"] | undefined;
    grid.on("scroll", (event) => {
      scrollEvent = event;
    });

    const scroller = scrollerOf(host);
    scroller.scrollLeft = 800;
    scroller.dispatchEvent(new Event("scroll"));

    const farRequest = requests.find((request) => requestColumnIndices(request).includes(9));
    if (!farRequest) throw new Error("far horizontal datasource request was not issued");
    expect(farRequest.columns).toEqual([
      { start: 0, end: 1, keys: ["c0"] },
      {
        start: 9,
        end: 18,
        keys: ["c9", "c10", "c11", "c12", "c13", "c14", "c15", "c16", "c17"],
      },
    ]);
    expect(requestColumnIndices(farRequest)).not.toContain(1);
    expect(requestColumnIndices(farRequest).length).toBeLessThan(sheet.columns.length);
    expect(scrollEvent).toMatchObject({
      scrollLeft: 800,
      firstVisibleColumn: 0,
      lastVisibleColumn: 16,
    });
    expect(recorder.paints.length).toBeGreaterThan(0);
    grid.destroy();
  });

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
    const lastPaint = recorder.paints.at(-1)?.values ?? [];
    for (let row = firstOnScreen; row <= lastOnScreen; row++) {
      expect(grid.store.getCell({ sheet: "s1", row, col: column }).resolved).toBe(row * 2);
      expect(lastPaint).toContain(row * 2);
    }
    grid.destroy();
  });
});
