import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DocumentOp, Renderer, Viewport, VisibleWindowView } from "../src/types.js";
import {
  makeColumnarData,
  makeWorkbook,
  mountGridWithData,
  mountHost,
  scrollerOf,
} from "./fixtures.js";

// Renders are forced synchronous so a scheduled repaint is observable without
// racing a real animation-frame timer. (Same harness as grid-interaction.test.ts.)
const original_raf = globalThis.requestAnimationFrame;
let restore_stubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});

afterEach(() => {
  restore_stubs();
  globalThis.requestAnimationFrame = original_raf;
});

// A renderer that records each paint with a snapshot of the frame's row
// geometry, since Viewport.rowHeights aliases a reused scratch buffer.
interface Recorder extends Renderer {
  readonly paints: Array<{ view: VisibleWindowView; rowHeights: number[] | null }>;
}

function make_recorder(): Recorder {
  const paints: Recorder["paints"] = [];
  let last_viewport: Viewport | null = null;
  return {
    paints,
    mount() {},
    setLayout() {},
    setViewport(viewport: Viewport) {
      last_viewport = viewport;
    },
    paint(view: VisibleWindowView) {
      paints.push({
        view,
        rowHeights: last_viewport?.rowHeights ? Array.from(last_viewport.rowHeights) : null,
      });
    },
    setTheme() {},
    setRenderers() {},
    destroy() {},
  };
}

describe("view composition", () => {
  for (const source of ["transaction", "remote", "history"] as const) {
    it(`reconciles filtered rows before change listeners for ${source} commits`, () => {
      const { store, host, grid } = mountGridWithData(50);
      const recorder = make_recorder();
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
    const recorder = make_recorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);

    grid.setRowHeight(0, 30);

    expect(recorder.paints.at(-1)?.view.rows).toEqual({ start: 0, end: 17 });
    expect(recorder.paints.at(-1)?.rowHeights?.[0]).toBe(30);
    expect(grid.getSelection()).toEqual(selection);
    grid.destroy();
  });

  it("reconciles the row view before listeners when column structure clears a filter", () => {
    const { store, grid } = mountGridWithData(10);
    grid.setColumnFilter(2, { kind: "values", values: ["Tokyo"] });
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    const recorder = make_recorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);
    let observed_end: number | undefined;
    grid.on("change", () => {
      grid.refresh();
      observed_end = recorder.paints.at(-1)?.view.rows.end;
      expect(grid.getSelection()).toBeNull();
    });

    expect(
      grid.applyTransaction({
        patches: [{ op: "removeColumns", sheet: "s1", at: 2, count: 1 }],
      }).status,
    ).toBe("applied");

    expect(store.viewRowCount("s1")).toBe(10);
    expect(observed_end).toBe(10);
    grid.destroy();
  });

  it("reconciles hidden-row replacement and collapsed groups from document operations", () => {
    const workbook = makeWorkbook(10);
    const store = new SheetwriteStore(workbook, makeColumnarData(10));
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const recorder = make_recorder();
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
    const { workbook, store, grid } = mountGridWithData(5);

    // Sort amount descending → view order [4,3,2,1,0]; view row 1 is data row 3.
    grid.setViewSort([{ col: 1, ascending: false }]);
    const data_row = store.dataRowAt("s1", 1);
    expect(data_row).toBe(3);

    const recorder = make_recorder();
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);

    grid.setRowHeight(1, 60);

    // Persisted keyed by DATA row 3, never by the view row 1 (the pre-fix bug).
    expect(workbook.sheets[0]!.rowHeights?.get(data_row)).toBe(60);
    expect(workbook.sheets[0]!.rowHeights?.has(1)).toBe(false);

    grid.clearView();

    // Cleared view is identity, so data row 3 sits at view position 3. The
    // override must paint there.
    const row_heights = recorder.paints.at(-1)?.rowHeights;
    expect(row_heights?.[data_row]).toBe(60);
    expect(row_heights?.[1]).not.toBe(60);

    grid.destroy();
  });
});
