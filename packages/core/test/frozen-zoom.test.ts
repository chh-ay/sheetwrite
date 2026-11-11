import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type {
  DocumentOp,
  PanePaint,
  Renderer,
  RenderLayout,
  Theme,
  Viewport,
  VisibleWindowView,
} from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

// Renders are forced synchronous so a scheduled repaint is observable without
// racing a real animation-frame timer. (Same harness as grid-interaction.test.ts.)
const originalRaf = globalThis.requestAnimationFrame;
let restoreStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
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

function scrollerOf(host: HTMLElement): HTMLDivElement {
  const node = host.querySelector(".sheetwrite-scroller");
  if (!(node instanceof HTMLDivElement)) throw new Error("expected grid scroller");
  return node;
}

// A renderer that records the frame contracts each test inspects: plain paints
// (with a snapshot of the frame's row geometry, since Viewport.rowHeights aliases
// a reused scratch buffer), frozen-pane frames, layouts, and themes.
interface PaintCapture {
  view: VisibleWindowView;
  rowHeights: number[] | null;
}
interface Recorder extends Renderer {
  readonly paints: PaintCapture[];
  readonly paneFrames: Array<{
    panes: readonly PanePaint[];
    divider: { x: number | null; y: number | null };
  }>;
  readonly layouts: RenderLayout[];
  readonly themes: Theme[];
}

function makeRecorder(): Recorder {
  const paints: PaintCapture[] = [];
  const paneFrames: Recorder["paneFrames"] = [];
  const layouts: RenderLayout[] = [];
  const themes: Theme[] = [];
  let lastViewport: Viewport | null = null;
  const rec: Recorder = {
    paints,
    paneFrames,
    layouts,
    themes,
    mount() {},
    setLayout(layout: RenderLayout) {
      layouts.push(layout);
    },
    setViewport(viewport: Viewport) {
      lastViewport = viewport;
    },
    paint(view: VisibleWindowView) {
      paints.push({
        view,
        rowHeights: lastViewport?.rowHeights ? Array.from(lastViewport.rowHeights) : null,
      });
    },
    setTheme(theme: Theme) {
      themes.push(theme);
    },
    setRenderers() {},
    destroy() {},
  };
  rec.paintPanes = (panes, divider) => {
    paneFrames.push({ panes, divider });
  };
  return rec;
}

describe("view composition", () => {
  for (const source of ["transaction", "remote", "history"] as const) {
    it(`reconciles filtered rows before change listeners for ${source} commits`, () => {
      const workbook = makeWorkbook(50);
      const store = new SheetwriteStore(workbook, makeColumnarData(50));
      const host = mountHost();
      const grid = new GridImpl(host, { workbook }, store);
      const recorder = makeRecorder();
      expect(Reflect.set(grid, "renderer", recorder)).toBe(true);
      grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 0 } });
      scrollerOf(host).scrollTop = 200;
      const observed: Array<{ start: number; end: number } | undefined> = [];
      grid.on("change", () => {
        grid.refresh();
        observed.push(recorder.paints.at(-1)?.view.rows);
        expect(grid.getSelection()).toBeNull();
        expect(scrollerOf(host).scrollTop).toBe(0);
      });
      const patches: DocumentOp[] = [
        {
          op: "setSheetMeta" as const,
          sheet: "s1",
          patch: { filters: [[2, { kind: "values" as const, values: ["Tokyo"] }]] },
        },
      ];
      if (source === "transaction") {
        expect(grid.applyTransaction({ patches }).status).toBe("applied");
      } else if (source === "remote") {
        expect(grid.applyRemoteOperations(patches).status).toBe("applied");
      } else {
        grid.setColumnFilter(2, { kind: "values", values: ["Tokyo"] });
        grid.undo();
        grid.redo();
      }

      expect(store.viewRowCount("s1")).toBe(17);
      expect(observed.at(-1)).toEqual({ start: 0, end: 17 });
      if (source === "history") {
        expect(observed[0]).toEqual({ start: 0, end: 17 });
        expect(observed[1]?.end).toBeGreaterThan(17);
      }
      expect(recorder.paints.at(-1)?.view.rows).toEqual({ start: 0, end: 17 });
      grid.destroy();
    });
  }

  it("keeps filtered geometry bounded when a row height rebuilds the index", () => {
    const workbook = makeWorkbook(50);
    const store = new SheetwriteStore(workbook, makeColumnarData(50));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    grid.setColumnFilter(2, { kind: "values", values: ["Tokyo"] });
    const selection = { kind: "cell" as const, addr: { sheet: "s1", row: 2, col: 0 } };
    grid.setSelection(selection);
    const recorder = makeRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);

    grid.setRowHeight(0, 30);

    expect(recorder.paints.at(-1)?.view.rows).toEqual({ start: 0, end: 17 });
    expect(recorder.paints.at(-1)?.rowHeights?.[0]).toBe(30);
    expect(grid.getSelection()).toEqual(selection);
    grid.destroy();
  });

  it("reconciles the row view before listeners when column structure clears a filter", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);
    grid.setColumnFilter(2, { kind: "values", values: ["Tokyo"] });
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    const recorder = makeRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);
    let observedEnd: number | undefined;
    grid.on("change", () => {
      grid.refresh();
      observedEnd = recorder.paints.at(-1)?.view.rows.end;
      expect(grid.getSelection()).toBeNull();
    });

    expect(
      grid.applyTransaction({
        patches: [{ op: "removeColumns", sheet: "s1", at: 2, count: 1 }],
      }).status,
    ).toBe("applied");

    expect(store.viewRowCount("s1")).toBe(10);
    expect(observedEnd).toBe(10);
    grid.destroy();
  });

  it("reconciles hidden-row replacement and collapsed groups from document operations", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const recorder = makeRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);
    const commit = (patches: DocumentOp[], count: number) => {
      grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
      expect(grid.applyTransaction({ patches }).status).toBe("applied");
      expect(recorder.paints.at(-1)?.view.rows).toEqual({ start: 0, end: count });
      expect(grid.getSelection()).toBeNull();
    };
    commit([{ op: "setRowMeta", sheet: "s1", row: 1, meta: { hidden: true } }], 9);
    // Row metadata is replacement: omitting hidden unhides a formerly hidden row.
    commit([{ op: "setRowMeta", sheet: "s1", row: 1, meta: { height: 30 } }], 10);
    commit(
      [
        {
          op: "setSheetMeta",
          sheet: "s1",
          patch: { rowGroups: [{ start: 2, end: 5, collapsed: true }] },
        },
      ],
      6,
    );
    grid.destroy();
  });
});

describe("row heights under views", () => {
  // Regression: setRowHeight takes a VIEW row but must persist the override keyed
  // by the underlying DATA row, so that after the view is cleared the height
  // reappears on that data row's natural position — not on the old view slot.
  it("keys overrides by data row and repaints them on the natural row after clearView", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook }, store);

    // Sort amount descending → view order [4,3,2,1,0]; view row 1 is data row 3.
    grid.setViewSort([{ col: 1, ascending: false }]);
    const dataRow = store.dataRowAt("s1", 1);
    expect(dataRow).toBe(3);

    const recorder = makeRecorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);

    grid.setRowHeight(1, 60);

    // Persisted keyed by DATA row 3, never by the view row 1 (the pre-fix bug).
    expect(workbook.sheets[0]!.rowHeights?.get(dataRow)).toBe(60);
    expect(workbook.sheets[0]!.rowHeights?.has(1)).toBe(false);

    grid.clearView();

    // Cleared view is identity, so data row 3 sits at view position 3. The
    // override must paint there.
    const rowHeights = recorder.paints.at(-1)?.rowHeights;
    expect(rowHeights?.[dataRow]).toBe(60);
    expect(rowHeights?.[1]).not.toBe(60);

    grid.destroy();
  });
});
