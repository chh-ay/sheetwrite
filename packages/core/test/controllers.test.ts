import { beforeAll, describe, expect, it } from "bun:test";
import type { AriaMirror } from "../src/aria-mirror.js";
import { DatasourceController } from "../src/datasource-controller.js";
import { DocumentController } from "../src/document-controller.js";
import type { DomMergeAnchorRequest, DomOverlay } from "../src/dom-overlay.js";
import { GeometryLayoutController } from "../src/geometry-layout-controller.js";
import { DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import type { OverlayPainter } from "../src/overlay-painter.js";
import { RenderCoordinator } from "../src/render-coordinator.js";
import { SheetwriteStore } from "../src/store.js";
import type { Renderer, Store, Viewport, VisibleWindowView } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

describe("DocumentController", () => {
  it("rejects nested payload growth from callbacks that retain operation identity", () => {
    const maxEncodedBytes = 256;
    const oversizedValue = "x".repeat(maxEncodedBytes * 2);
    for (const mutationBoundary of ["materialization", "admission"] as const) {
      const transactionResourceLimits = { maxEncodedBytes, maxOperations: 1 };
      const store = new SheetwriteStore(makeWorkbook(4), undefined, { transactionResourceLimits });
      const mutatePayload = (patches: readonly import("../src/types.js").DocumentOp[]) => {
        const patch = patches[0];
        if (patch?.op === "set" && patch.value.kind === "literal") {
          patch.value.value = oversizedValue;
        }
      };
      const controller = new DocumentController({
        store,
        loadable: store,
        transactionResourceLimits,
        readOnly: () => false,
        epoch: () => 0,
        materializeVirtualColumns: (patches) => {
          if (mutationBoundary === "materialization") mutatePayload(patches);
          return patches;
        },
        admitTransaction: (patches) => {
          if (mutationBoundary === "admission") mutatePayload(patches);
          return { ok: true, reservation: { cancel() {}, finish() {} } };
        },
        onMutationRejected: () => {},
        onHistoryApplied: () => {},
      });
      const addr = { sheet: "s1", row: 0, col: 0 };
      try {
        expect(
          controller.commit(
            [{ op: "set", addr, value: { kind: "literal", value: "small" } }],
            "api",
          ).status,
        ).toBe("rejected");
        expect(store.getCell(addr).resolved).toBeNull();
      } finally {
        controller.destroy();
        store.dispose();
      }
    }
  });
  it("captures structural and range inverses for Store implementations without compact history", () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 0 },
          value: { kind: "literal", value: "row-one" },
          style: { bold: true },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 2, col: 1 },
          value: { kind: "formula", src: "=A2" },
        },
      ],
    });
    const controller = new DocumentController({
      store,
      // A custom Store has no compact SheetwriteStore range snapshots. The
      // controller must still construct complete serializable inverses.
      loadable: null,
      readOnly: () => false,
      epoch: () => 0,
      materializeVirtualColumns: (patches) => patches,
      onMutationRejected: () => {},
      onHistoryApplied: () => {},
    });

    expect(
      controller.commit([{ op: "removeRows", sheet: "s1", at: 1, count: 2 }], "api").status,
    ).toBe("applied");
    controller.undo();
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 })).toMatchObject({
      resolved: "row-one",
      style: { bold: true },
    });
    expect(store.getFormula({ sheet: "s1", row: 2, col: 1 })).toBe("=A2");

    expect(
      controller.commit([{ op: "removeColumns", sheet: "s1", at: 0, count: 2 }], "api").status,
    ).toBe("applied");
    controller.undo();
    expect(
      store
        .getWorkbook()
        .sheets[0]!.columns.slice(0, 2)
        .map(({ key }) => key),
    ).toEqual(["name", "amount"]);
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("row-one");

    const range = {
      sheet: "s1",
      start: { row: 2, col: 1 },
      end: { row: 1, col: 0 },
    };
    expect(controller.commit([{ op: "clearRange", range }], "api").status).toBe("applied");
    controller.undo();
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("row-one");
    expect(store.getFormula({ sheet: "s1", row: 2, col: 1 })).toBe("=A2");

    const namedRange = {
      name: "Selection",
      scope: "s1",
      range: { ...range, start: range.end, end: range.start },
    };
    expect(controller.commit([{ op: "setNamedRange", namedRange }], "api").status).toBe("applied");
    expect(
      controller.commit(
        [{ op: "setNamedRange", namedRange: { ...namedRange, name: "selection" } }],
        "api",
      ).status,
    ).toBe("applied");
    controller.undo();
    expect(store.getWorkbook().namedRanges).toEqual([namedRange]);
    expect(
      controller.commit([{ op: "removeNamedRange", name: "SELECTION", scope: "s1" }], "api").status,
    ).toBe("applied");
    controller.undo();
    expect(store.getWorkbook().namedRanges).toEqual([namedRange]);

    controller.destroy();
    store.dispose();
  });
});

describe("GeometryLayoutController", () => {
  it("owns zoomed indexes, frozen bands, windows, and cell rectangles", () => {
    const zoom = 2;
    const workbook = makeWorkbook(10);
    const sheet = workbook.sheets[0]!;
    const [first = 0, second = 0] = sheet.columns.map((column) => column.width ?? 0);
    sheet.frozenRows = 2;
    sheet.frozenCols = 1;
    sheet.rowHeights = new Map([[1, 40]]);
    const controller = new GeometryLayoutController(
      {
        sheet: () => sheet,
        activeSheet: () => "s1",
        loadable: null,
        // The grid passes a theme already scaled by zoom.
        theme: () => ({ ...DEFAULT_THEME, rowHeight: DEFAULT_THEME.rowHeight * zoom }),
        zoom: () => zoom,
        maxElementHeight: () => 33_000_000,
      },
      400,
    );
    const frozenHeight = (DEFAULT_THEME.rowHeight + 40) * zoom;

    expect(controller.rowHeight(1)).toBe(40 * zoom);
    expect(controller.frozenHeight()).toBe(frozenHeight);
    expect(controller.frozenWidth()).toBe(first * zoom);
    expect(controller.paintWindow(0, 0, 400, 900, 0)).toMatchObject({
      frozenRows: 2,
      frozenColumns: 1,
      frozenWidth: first * zoom,
    });
    expect(
      controller.rangeRect(
        {
          sheet: "s1",
          start: { row: 0, col: 0 },
          end: { row: 1, col: 1 },
        },
        0,
        0,
      ),
    ).toMatchObject({ w: (first + second) * zoom, h: frozenHeight });
  });
});

describe("RenderCoordinator", () => {
  it("separates pixel repaints from logical data-window invalidation", () => {
    const store = new SheetwriteStore(makeWorkbook(8));
    let windowReads = 0;
    let scrollTop = 0;
    let scrollLeft = 0;
    let storeEpoch = 0;
    let zoom = 1;
    let anchorRequests: readonly DomMergeAnchorRequest[] = [];
    const countedStore = {
      getVisibleWindow: (...args: Parameters<Store["getVisibleWindow"]>) => {
        windowReads += 1;
        return store.getVisibleWindow(...args);
      },
    } as unknown as Store;
    const sheet = store.getWorkbook().sheets[0]!;
    const geometry = new GeometryLayoutController(
      {
        sheet: () => sheet,
        activeSheet: () => "s1",
        loadable: null,
        theme: () => DEFAULT_THEME,
        zoom: () => zoom,
        maxElementHeight: () => 33_000_000,
      },
      180,
    );
    const datasource = new DatasourceController(
      {
        loadable: null,
        activeSheet: () => "s1",
        rowCount: () => sheet.rowCount,
        columns: () => sheet.columns,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
      },
      sheet.rowCount,
    );
    const viewports: Viewport[] = [];
    const paints: VisibleWindowView[] = [];
    let overlayPaints = 0;
    const domAnchorViewCounts: number[] = [];
    let ariaUpdates = 0;
    const renderer: Renderer = {
      mount: () => {},
      setLayout: () => {},
      setViewport: (viewport) => viewports.push(viewport),
      paint: (view) => paints.push(view),
      setTheme: () => {},
      setRenderers: () => {},
      destroy: () => {},
    };
    const overlay = {
      paint: () => {
        overlayPaints += 1;
      },
    } as unknown as OverlayPainter;
    const domOverlay = {
      mergeAnchorRequests: () => anchorRequests,
      paint: (
        _view: VisibleWindowView,
        _viewport: Viewport,
        anchorViews: readonly VisibleWindowView[],
      ) => {
        domAnchorViewCounts.push(anchorViews.length);
      },
      paintPanes: () => {},
    } as unknown as DomOverlay;
    const aria = {
      bumpVersion: () => {},
      update: () => {
        ariaUpdates += 1;
      },
    } as unknown as AriaMirror;
    const scheduled: FrameRequestCallback[] = [];
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      scheduled.push(callback);
      return scheduled.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

    const coordinator = new RenderCoordinator({
      renderer: () => renderer,
      domOverlay,
      overlayPainter: overlay,
      ariaMirror: aria,
      geometry,
      datasource,
      store: countedStore,
      activeSheet: () => "s1",
      theme: () => DEFAULT_THEME,
      overscan: () => 0,
      zoom: () => zoom,
      storeEpoch: () => storeEpoch,
      viewportHeight: () => 180,
      viewportWidth: () => 420,
      scrollTop: () => scrollTop,
      scrollLeft: () => scrollLeft,
      repositionEditor: () => {},
      emitScroll: () => {},
    });

    // Runs one frame and reports whether it read a new logical data window.
    const readsWindow = (change: () => void): boolean => {
      const before = windowReads;
      change();
      coordinator.renderNow();
      return windowReads > before;
    };

    try {
      coordinator.schedule();
      coordinator.schedule();
      expect(scheduled).toHaveLength(1);
      scheduled[0]!(0);
      expect(paints).toHaveLength(1);
      expect(viewports).toHaveLength(1);
      expect(overlayPaints).toBe(1);
      expect(ariaUpdates).toBe(1);
      expect(windowReads).toBeGreaterThan(0);

      // Nothing changed: no frame.
      const readsBefore = windowReads;
      coordinator.renderNow();
      expect(paints).toHaveLength(1);
      expect(windowReads).toBe(readsBefore);

      // Pixel-only changes repaint without reading data.
      const revision = viewports.at(-1)?.contentRevision;
      expect(readsWindow(() => coordinator.invalidate())).toBe(false);
      expect(paints).toHaveLength(2);
      expect(viewports.at(-1)?.contentRevision).not.toBe(revision);
      expect(readsWindow(() => (scrollTop = 1))).toBe(false);
      expect(readsWindow(() => (scrollLeft = 1))).toBe(false);
      expect(paints).toHaveLength(4);

      // Crossing a row or column, a store change, or a data invalidation reads data.
      expect(readsWindow(() => (scrollTop = DEFAULT_THEME.rowHeight + 1))).toBe(true);
      expect(readsWindow(() => (scrollLeft = 170))).toBe(true);
      expect(readsWindow(() => (storeEpoch += 1))).toBe(true);
      expect(readsWindow(() => coordinator.invalidateData())).toBe(true);

      const paintsBeforeZoom = paints.length;
      expect(readsWindow(() => (zoom = 1.25))).toBe(false);
      expect(paints).toHaveLength(paintsBeforeZoom + 1);

      // Merge anchors outside the window are read once per changed request set.
      const invalidate = () => coordinator.invalidate();
      anchorRequests = [{ sheet: "s1", row: 0, cols: [0] }];
      expect(readsWindow(invalidate)).toBe(true);
      expect(domAnchorViewCounts.at(-1)).toBe(1);
      expect(readsWindow(invalidate)).toBe(false);
      for (const request of [
        { sheet: "s1", row: 1, cols: [0] },
        { sheet: "s1", row: 1, cols: [1] },
        { sheet: "s1", row: 1, cols: [1, 2] },
      ]) {
        anchorRequests = [request];
        expect(readsWindow(invalidate)).toBe(true);
      }
      anchorRequests = [];
      expect(readsWindow(invalidate)).toBe(false);
      expect(domAnchorViewCounts.at(-1)).toBe(0);

      const paintsBeforeDestroy = paints.length;
      coordinator.destroy();
      coordinator.renderNow();
      expect(paints).toHaveLength(paintsBeforeDestroy);
    } finally {
      coordinator.destroy();
      datasource.destroy();
      store.dispose();
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });
});
