import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import {
  MAX_CELL_FONT_SIZE,
  MIN_CELL_FONT_SIZE,
  sanitizeCellStyle,
} from "../src/cell-style-fields.js";
import { SheetwriteError } from "../src/errors.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import {
  hyperlinkAt,
  isSafeExternalHyperlink,
  resolveHyperlinkTarget,
  sanitizeCellHyperlink,
} from "../src/hyperlink.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellHyperlink, GridOptions, Workbook } from "../src/types.js";
import { makeWorkbook, mountHost } from "./fixtures.js";

function externalLink(url = "https://example.com/report?q=1"): CellHyperlink {
  return {
    id: "link-external",
    range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
    target: { kind: "external", url },
    display: "Open report",
    style: { color: "#123456", underline: true },
  };
}

let restoreCanvas: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
});

const grids: GridImpl[] = [];

afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  restoreCanvas();
  document.body.replaceChildren();
});

function mountGrid(options: GridOptions & { workbook: Workbook }) {
  const store = new SheetwriteStore(options.workbook);
  const grid = new GridImpl(mountHost(), options, store);
  grids.push(grid);
  return { grid, store };
}

describe("hyperlink policy", () => {
  it("admits only bounded absolute HTTPS and mailto targets", () => {
    expect(isSafeExternalHyperlink("https://example.com/path#section")).toBe(true);
    expect(isSafeExternalHyperlink("mailto:owner@example.com?subject=Sheet")).toBe(true);
    expect(isSafeExternalHyperlink("HTTPS://example.com/path")).toBe(true);
    for (const unsafe of [
      "http://example.com",
      "javascript:alert(1)",
      "data:text/html,boom",
      "file:///etc/passwd",
      "https:example.com",
      " https://example.com",
      "https://user:secret@example.com",
      "not a URL",
      "mailto:owner@example.com?subject=x%0d%0aBcc:attacker@example.com",
    ]) {
      expect(isSafeExternalHyperlink(unsafe)).toBe(false);
    }
  });

  it("sanitizes cell styles without invoking accessors or cloning hostile graphs", () => {
    expect(
      sanitizeCellStyle({
        color: "#123456",
        bold: true,
        fontSize: 16,
        border: { bottom: { color: "#654321", width: 2, style: "solid" } },
      }),
    ).toEqual({
      color: "#123456",
      bold: true,
      fontSize: 16,
      border: { bottom: { color: "#654321", width: 2, style: "solid" } },
    });
    for (const fontSize of [MIN_CELL_FONT_SIZE, MAX_CELL_FONT_SIZE]) {
      expect(sanitizeCellStyle({ fontSize })).toEqual({ fontSize });
    }
    for (const fontSize of [Number.POSITIVE_INFINITY, 546, 1]) {
      expect(sanitizeCellStyle({ fontSize })).toBeNull();
    }
    expect(sanitizeCellStyle({ color: "x".repeat(1_000_000) })).toBeNull();
    expect(sanitizeCellStyle({ unknown: { deep: { graph: new Array(10_000) } } })).toBeNull();

    let getterCalls = 0;
    const getterStyle = Object.defineProperty({}, "color", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "#123456";
      },
    });
    expect(sanitizeCellStyle(getterStyle)).toBeNull();
    expect(getterCalls).toBe(0);
    const throwingProxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("hostile");
        },
      },
    );
    expect(sanitizeCellStyle(throwingProxy)).toBeNull();
    expect(sanitizeCellHyperlink({ ...externalLink(), style: getterStyle })).toBeNull();
  });

  it("keeps internal targets on stable sheet IDs across rename and rejects removal", () => {
    const workbook = makeWorkbook(2);
    workbook.sheets.push({
      id: "destination",
      name: "Before",
      rowCount: 2,
      columns: workbook.sheets[0]!.columns.map((column) => ({ ...column })),
    });
    const target = {
      kind: "internal" as const,
      range: {
        sheet: "destination",
        start: { row: 1, col: 1 },
        end: { row: 1, col: 1 },
      },
    };
    workbook.sheets[1]!.name = "After";
    expect(resolveHyperlinkTarget(workbook, target)).toEqual({
      kind: "internal",
      address: { sheet: "destination", row: 1, col: 1 },
    });
    workbook.sheets.splice(1, 1);
    expect(() => resolveHyperlinkTarget(workbook, target)).toThrow(
      expect.objectContaining({ code: "unsafe-hyperlink", operation: "hyperlink-activate" }),
    );
  });

  it("fails closed with a public error for malformed runtime targets and range ends", () => {
    const workbook = makeWorkbook(2);
    expect(() =>
      resolveHyperlinkTarget(workbook, { kind: "internal", range: null } as never),
    ).toThrow(SheetwriteError);
    expect(() =>
      resolveHyperlinkTarget(workbook, {
        kind: "internal",
        range: {
          sheet: "s1",
          start: { row: 0, col: 0 },
          end: { row: workbook.sheets[0]!.rowCount, col: 0 },
        },
      }),
    ).toThrow(SheetwriteError);
  });

  it("paints explicit cell link fonts before defaults while retaining the default link look", () => {
    const workbook = makeWorkbook(2);
    const sheet = workbook.sheets[0];
    if (!sheet) throw new Error("missing sheet");
    const { style: _customStyle, ...link } = externalLink();
    sheet.hyperlinks = [link];
    const store = new SheetwriteStore(workbook);
    const visibleStyle = () => {
      const view = store.getVisibleWindow("s1", { start: 0, end: 1 }, [0]);
      return view.styles[view.styleIds[0] ?? 0];
    };

    expect(visibleStyle()).toMatchObject({ color: "#0563C1", underline: true });
    store.applyTransaction({
      patches: [
        {
          op: "setRangeStyle",
          range: link.range,
          style: { color: "#123456", underline: false },
        },
      ],
    });
    expect(visibleStyle()).toMatchObject({ color: "#123456", underline: false });
  });

  it("rejects unsafe mutations before document state changes", () => {
    const workbook = makeWorkbook(2);
    const { grid, store } = mountGrid({ workbook });
    expect(grid.setHyperlink(externalLink("javascript:alert(1)")).status).toBe("rejected");
    expect(store.getWorkbook().sheets[0]!.hyperlinks).toBeUndefined();
  });

  it("persists hyperlink operations through history, snapshots, structure, and sheet removal", () => {
    const workbook = makeWorkbook(2);
    workbook.sheets.push({
      id: "destination",
      name: "Destination",
      rowCount: 3,
      columns: workbook.sheets[0]!.columns.map((column) => ({ ...column })),
    });
    const { grid, store } = mountGrid({ workbook });
    const hyperlink: CellHyperlink = {
      id: "internal",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      target: {
        kind: "internal",
        range: {
          sheet: "destination",
          start: { row: 1, col: 1 },
          end: { row: 1, col: 1 },
        },
      },
    };
    expect(grid.setHyperlink(hyperlink).status).toBe("applied");
    grid.undo();
    expect(store.getWorkbook().sheets[0]!.hyperlinks).toEqual([]);
    grid.redo();
    expect(store.exportSnapshot().sheets[0]!.hyperlinks).toEqual([hyperlink]);

    store.applyTransaction({
      patches: [{ op: "addRows", sheet: "destination", at: 0, count: 1 }],
    });
    expect(store.getWorkbook().sheets[0]!.hyperlinks![0]!.target).toMatchObject({
      range: { start: { row: 2, col: 1 }, end: { row: 2, col: 1 } },
    });
    store.applyTransaction({
      patches: [{ op: "moveRows", sheet: "destination", from: 2, count: 1, to: 0 }],
    });
    expect(store.getWorkbook().sheets[0]!.hyperlinks![0]!.target).toMatchObject({
      range: { start: { row: 0, col: 1 }, end: { row: 0, col: 1 } },
    });
    store.applyTransaction({
      patches: [
        {
          op: "addColumns",
          sheet: "destination",
          at: 0,
          columns: [{ key: "inserted", header: "Inserted", width: 100, type: "text" }],
        },
      ],
    });
    expect(store.getWorkbook().sheets[0]!.hyperlinks![0]!.target).toMatchObject({
      range: { start: { row: 0, col: 2 }, end: { row: 0, col: 2 } },
    });
    store.applyTransaction({
      patches: [{ op: "moveColumns", sheet: "destination", from: 2, count: 1, to: 0 }],
    });
    expect(store.getWorkbook().sheets[0]!.hyperlinks![0]!.target).toMatchObject({
      range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
    });
    expect(grid.removeSheet("destination").status).toBe("applied");
    expect(store.getWorkbook().sheets[0]!.hyperlinks).toEqual([]);
    grid.undo();
    expect(store.getWorkbook().sheets[0]!.hyperlinks).toHaveLength(1);
  });

  it("emits a validated host event without opening external URLs", () => {
    const workbook = makeWorkbook(2);
    workbook.sheets[0]!.hyperlinks = [externalLink()];
    const { grid } = mountGrid({ workbook, hyperlinkActivation: "event-only" });
    const events: unknown[] = [];
    grid.on("hyperlink-activate", (event) => events.push(event));

    expect(grid.activateHyperlink({ sheet: "s1", row: 0, col: 0 })).toBe(true);
    expect(events).toEqual([
      {
        address: { sheet: "s1", row: 0, col: 0 },
        hyperlink: externalLink(),
        target: { kind: "external", href: "https://example.com/report?q=1" },
      },
    ]);
  });

  it("revalidates after host mutation and emits nothing for an unsafe target", () => {
    const workbook: Workbook = makeWorkbook(2);
    workbook.sheets[0]!.hyperlinks = [externalLink()];
    const { grid } = mountGrid({ workbook });
    let emitted = false;
    grid.on("hyperlink-activate", () => {
      emitted = true;
    });
    workbook.sheets[0]!.hyperlinks![0]!.target = {
      kind: "external",
      url: "javascript:alert(1)",
    };

    expect(grid.activateHyperlink({ sheet: "s1", row: 0, col: 0 })).toBe(false);
    expect(emitted).toBe(false);
  });

  it("returns cloned metadata from range lookup", () => {
    const workbook = makeWorkbook(2);
    workbook.sheets[0]!.hyperlinks = [
      {
        ...externalLink(),
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
      },
    ];
    const found = hyperlinkAt(workbook, { sheet: "s1", row: 1, col: 1 });
    expect(found?.id).toBe("link-external");
    found!.style!.color = "#000000";
    expect(workbook.sheets[0]!.hyperlinks![0]!.style!.color).toBe("#123456");
  });
});
