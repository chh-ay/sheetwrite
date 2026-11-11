import { describe, expect, it } from "bun:test";

import { SheetRegistry } from "../src/store/sheet-registry.js";
import { StoreViewState } from "../src/store/view-state.js";
import type { RecomputingCellStore } from "../src/store/wasm-contract.js";
import type { Workbook } from "../src/types.js";

function sheetRegistry(
  document: Workbook,
  handles: ReadonlyArray<[string, number]>,
): SheetRegistry {
  const sheets = new SheetRegistry(document);
  for (const [sheet, handle] of handles) sheets.handles.set(sheet, handle);
  return sheets;
}

function workbook(rowCount: number): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount,
        columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        sortKeys: [{ col: 0, ascending: true }],
      },
    ],
  };
}

function sortedView(
  rowCount: number,
  initialOrder: readonly number[],
): {
  readonly workbook: Workbook;
  readonly view: StoreViewState;
  setOrder(order: readonly number[]): void;
} {
  const document = workbook(rowCount);
  let order = Uint32Array.from(initialOrder);
  const wasm = {
    sortRowsMulti: () => order,
  } as unknown as RecomputingCellStore;
  const view = new StoreViewState(wasm, sheetRegistry(document, [["s1", 0]]));
  view.metadataChanged("s1");
  return {
    workbook: document,
    view,
    setOrder(next) {
      order = Uint32Array.from(next);
      view.metadataChanged("s1");
    },
  };
}

describe("StoreViewState packed inverse index", () => {
  it("attributes exact packed order and inverse-index byte lengths", () => {
    const { view } = sortedView(6, [5, 1, 3]);
    const order = view.resourceOwners().find((owner) => owner.owner === "js.view.order")!;
    expect(order).toMatchObject({ logicalBytes: 12, allocatedBytes: 12, entries: 3 });
    expect(
      view.resourceOwners().find((owner) => owner.owner === "js.view.inverse-index"),
    ).toMatchObject({ logicalBytes: 0, allocatedBytes: 0, entries: 0 });

    expect(view.viewRowOf("s1", 5)).toBe(0);
    expect(
      view.resourceOwners().find((owner) => owner.owner === "js.view.inverse-index"),
    ).toMatchObject({ logicalBytes: 24, allocatedBytes: 24, entries: 6 });

    view.dispose();
    expect(
      view
        .resourceOwners()
        .filter((owner) => owner.owner.startsWith("js.view."))
        .every((owner) => owner.logicalBytes === 0 && owner.entries === 0),
    ).toBe(true);
  });

  it("maps collapsed groups and explicitly rejects layouts wider than the sentinel", () => {
    const document = workbook(6);
    const sheet = document.sheets[0]!;
    sheet.sortKeys = [];
    sheet.rowGroups = [{ start: 2, end: 4, collapsed: true }];
    const view = new StoreViewState(
      {} as RecomputingCellStore,
      sheetRegistry(document, [["s1", 0]]),
    );
    view.metadataChanged("s1");

    expect(Array.from(view.order("s1") ?? [])).toEqual([0, 1, 5]);
    expect(view.viewRowOf("s1", 0)).toBe(0);
    expect(view.viewRowOf("s1", 5)).toBe(2);
    expect(view.viewRowOf("s1", 2)).toBeNull();
    expect(view.viewRowOf("s1", 4)).toBeNull();

    const oversized = sortedView(0x1_0000_0000, [0]);
    expect(() => oversized.view.viewRowOf("s1", 0)).toThrow(
      expect.objectContaining({ code: "resource-limit", operation: "store" }),
    );
  });

  it("rejects out-of-bounds and duplicate view rows instead of creating coordinate aliases", () => {
    const outOfBounds = sortedView(3, [0, 3]);
    expect(() => outOfBounds.view.viewRowOf("s1", 0)).toThrow(RangeError);

    const denseDuplicate = sortedView(3, [0, 1, 1]);
    expect(() => denseDuplicate.view.viewRowOf("s1", 0)).toThrow(RangeError);

    const sparseDuplicate = sortedView(1_000_000, [0, 8, 0]);
    expect(() => sparseDuplicate.view.viewRowOf("s1", 0)).toThrow(RangeError);
  });
});
