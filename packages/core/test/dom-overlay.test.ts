import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type {
  CellPaintContext,
  CellRenderer,
  ColumnarData,
  PresenceOverlay,
  Workbook,
} from "../src/types.js";

const originalRaf = globalThis.requestAnimationFrame;
let restoreStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs({ width: 360, height: 168 });
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callback(0);
    return 0;
  }) as typeof requestAnimationFrame;
});

afterEach(() => {
  restoreStubs();
  globalThis.requestAnimationFrame = originalRaf;
  document.body.replaceChildren();
});

interface RendererStats {
  mounts: number;
  updates: number;
  destroys: number;
  live: number;
}

function trackedRenderer(prefix: string, stats: RendererStats): CellRenderer {
  const sync = (element: HTMLElement, context: CellPaintContext): void => {
    element.textContent = `${prefix}:${String(context.value ?? "")}`;
    element.dataset.width = String(context.w);
    element.dataset.height = String(context.h);
    element.dataset.color = context.style.color ?? "";
  };
  return {
    dom(context) {
      stats.mounts += 1;
      stats.live += 1;
      const button = document.createElement("button");
      button.type = "button";
      button.style.pointerEvents = "auto";
      button.setAttribute("aria-label", `Rendered ${String(context.value ?? "empty")}`);
      sync(button, context);
      return button;
    },
    update(element, context) {
      stats.updates += 1;
      sync(element, context);
    },
    destroy() {
      stats.destroys += 1;
      stats.live -= 1;
    },
  };
}

function fixture(): { workbook: Workbook; data: ColumnarData } {
  const columns = Array.from({ length: 10 }, (_, col) => ({
    key: `c${col}`,
    header: `C${col}`,
    width: 90,
    type: "text" as const,
    renderer: "dom",
  }));
  const sheet = {
    id: "s1",
    name: "Sheet 1",
    rowCount: 80,
    columns,
    frozenRows: 1,
    frozenCols: 1,
    merges: [{ r0: 2, c0: 1, r1: 3, c1: 2 }],
  };
  const second = {
    id: "s2",
    name: "Sheet 2",
    rowCount: 20,
    columns: columns.map((column) => ({ ...column })),
  };
  const values: Record<string, string[]> = {};
  for (let col = 0; col < columns.length; col++) {
    values[`c${col}`] = Array.from({ length: sheet.rowCount }, (_, row) => `r${row}c${col}`);
  }
  return {
    workbook: { activeSheet: "s1", sheets: [sheet, second] },
    data: { rowCount: sheet.rowCount, columns: values },
  };
}

function cell(host: HTMLElement, row: number, col: number): HTMLDivElement {
  const element = host.querySelector(`.sheetwrite-dom-cell[data-row="${row}"][data-col="${col}"]`);
  if (!(element instanceof HTMLDivElement)) {
    throw new Error(`expected retained DOM cell ${row}:${col}`);
  }
  return element;
}

function scroller(host: HTMLElement): HTMLDivElement {
  const element = host.querySelector(".sheetwrite-scroller");
  if (!(element instanceof HTMLDivElement)) throw new Error("expected grid scroller");
  return element;
}

function px(value: string): number {
  return Number.parseFloat(value);
}

describe("retained DOM cell renderer overlay", () => {
  it("mounts and refreshes a tall merge anchor outside the visible row window", () => {
    const stats: RendererStats = { mounts: 0, updates: 0, destroys: 0, live: 0 };
    const { workbook, data } = fixture();
    workbook.sheets[0]!.merges = [{ r0: 20, c0: 1, r1: 60, c1: 2 }];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      renderers: { dom: trackedRenderer("tall", stats) },
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });

    expect(host.querySelector('.sheetwrite-dom-cell[data-row="20"][data-col="1"]')).toBeNull();
    scroller(host).scrollTop = 35 * 28;
    grid.refresh();

    const anchor = cell(host, 20, 1);
    const node = anchor.querySelector("button");
    expect(node?.textContent).toBe("tall:r20c1");
    expect(anchor.style.display).toBe("block");
    expect(host.querySelector('.sheetwrite-dom-cell[data-row="35"][data-col="1"]')).toBeNull();

    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 20, col: 1 },
          value: { kind: "literal", value: "off-window-edit" },
          style: { color: "#123456" },
        },
      ],
    });
    expect(cell(host, 20, 1)).toBe(anchor);
    expect(anchor.querySelector("button")).toBe(node);
    expect(node?.textContent).toBe("tall:off-window-edit");
    expect(node?.dataset.color).toBe("#123456");
    expect(host.querySelectorAll('.sheetwrite-dom-cell[data-row="20"][data-col="1"]')).toHaveLength(
      1,
    );
    grid.destroy();
    expect(stats.live).toBe(0);
  });

  it("rejects one renderer node shared by two cells and releases its ownership", () => {
    const stats: RendererStats = { mounts: 0, updates: 0, destroys: 0, live: 0 };
    const { workbook, data } = fixture();
    workbook.sheets[0]!.frozenRows = 0;
    workbook.sheets[0]!.frozenCols = 0;
    workbook.sheets[0]!.merges = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      renderers: { dom: trackedRenderer("initial", stats) },
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });
    const shared = document.createElement("button");
    let sharedDestroys = 0;
    const sharedRenderer: CellRenderer = {
      dom() {
        return shared;
      },
      destroy() {
        sharedDestroys += 1;
      },
    };

    expect(() => grid.defineCellRenderer("dom", sharedRenderer)).toThrow(
      expect.objectContaining({ code: "invalid-argument", operation: "render" }),
    );
    expect(sharedDestroys).toBe(1);
    expect(shared.parentNode).toBeNull();
    expect(host.querySelectorAll(".sheetwrite-dom-cell")).toHaveLength(0);

    let returnedShared = false;
    grid.defineCellRenderer("dom", {
      dom() {
        if (!returnedShared) {
          returnedShared = true;
          return shared;
        }
        return document.createElement("button");
      },
    });
    expect(shared.isConnected).toBe(true);
    grid.destroy();
    expect(shared.parentNode).toBeNull();
  });

  it("recreates a legacy dom-only renderer on a value change but not on a pure scroll", () => {
    const { workbook, data } = fixture();
    let calls = 0;
    const renderer: CellRenderer = {
      dom(context) {
        calls += 1;
        const element = document.createElement("span");
        element.textContent = String(context.value ?? "");
        return element;
      },
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      renderers: { dom: renderer },
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });
    const initialCalls = calls;
    const scroll = scroller(host);
    scroll.scrollLeft = 1;
    grid.refresh();
    expect(calls).toBe(initialCalls);

    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: "legacy-edit" },
        },
      ],
    });
    expect(calls).toBeGreaterThan(initialCalls);
    expect(cell(host, 0, 0).textContent).toBe("legacy-edit");
    grid.destroy();
  });

  it("keeps the 32-actor by 8-range limit bounded to rail or range markers", () => {
    const { workbook, data } = fixture();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridImpl(host, {
      workbook,
      data,
      overscan: 0,
      config: { toolbar: false, contextMenu: false, find: false },
    });
    const overlays: PresenceOverlay[] = Array.from({ length: 32 }, (_, index) => ({
      actorId: `actor-${index}`,
      displayName: index === 0 ? "  " : `Remote operator with a long identity ${index}`,
      color: index % 2 === 0 ? "#58c4dc" : "#e76f51",
      activeSheet: "s1",
      ranges: Array.from({ length: 8 }, (_, rangeIndex) => ({
        sheet: "s1",
        start: { row: rangeIndex % 5, col: 0 },
        end: { row: rangeIndex % 5, col: 2 },
      })),
    }));

    grid.setPresenceOverlays(overlays);
    grid.refresh();
    const labels = [...host.querySelectorAll<HTMLElement>("[data-sheetwrite-presence-label]")];
    expect(labels).toHaveLength(overlays.length);
    expect(labels.some((label) => label.dataset.presenceKind === "marker")).toBe(true);
    const firstLabel = labels[0];
    if (!firstLabel) throw new Error("Expected a presence label for the first actor");
    expect(firstLabel.title).toBe("actor-0");
    expect(firstLabel.getAttribute("aria-label")).toContain("actor-0");
    for (const label of labels) {
      expect(px(label.style.left)).toBeGreaterThanOrEqual(0);
      expect(px(label.style.top)).toBeGreaterThanOrEqual(0);
      expect(px(label.style.left) + px(label.style.width)).toBeLessThanOrEqual(360);
      expect(px(label.style.top) + px(label.style.height)).toBeLessThanOrEqual(168);
    }
    grid.destroy();
  });
});
