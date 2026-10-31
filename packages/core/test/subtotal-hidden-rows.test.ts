import { afterEach, beforeAll, describe, expect, it, spyOn } from "bun:test";

import { getEngine } from "../src/engine.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook, sheet } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const stores: SheetwriteStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
});

/**
 * Sheet 1 holds the fixture rows (amounts 0.5, 10.5, … 50.5; cities Phnom
 * Penh, Tokyo, Berlin repeating); sheet s2 holds the subtotals over them.
 */
function storeWithSubtotals(workbook: Workbook = makeWorkbook(6)): SheetwriteStore {
  workbook.sheets.push(sheet("s2", 2));
  const store = new SheetwriteStore(workbook, makeColumnarData(workbook.sheets[0]?.rowCount));
  stores.push(store);
  store.applyTransaction({
    patches: [
      {
        op: "set",
        addr: { sheet: "s2", row: 0, col: 0 },
        value: { kind: "formula", src: "=SUBTOTAL(9,'Sheet 1'!B1:B6)" },
      },
      {
        op: "set",
        addr: { sheet: "s2", row: 1, col: 0 },
        value: { kind: "formula", src: "=SUBTOTAL(109,'Sheet 1'!B1:B6)" },
      },
    ],
  });
  return store;
}

function subtotals(store: SheetwriteStore): unknown[] {
  return [0, 1].map((row) => store.getCell({ sheet: "s2", row, col: 0 }).resolved);
}

describe("SUBTOTAL over hidden rows", () => {
  it("skips filtered rows for every code and rows hidden by hand or by a group for 101-111", () => {
    const store = storeWithSubtotals();
    expect(subtotals(store)).toEqual([153, 153]);

    store.hideRows("s1", [1]);
    expect(subtotals(store)).toEqual([153, 142.5]);

    store.groupRows("s1", 3, 4);
    store.setGroupCollapsed("s1", 3, true);
    expect(subtotals(store)).toEqual([153, 71.5]);

    // Keeps Phnom Penh and Tokyo, so rows 3 and 6 (Berlin) are filtered out.
    store.setColumnFilter("s1", 2, { kind: "values", values: ["Phnom Penh", "Tokyo"] });
    expect(subtotals(store)).toEqual([82, 0.5]);

    store.setColumnFilter("s1", 2, null);
    store.setGroupCollapsed("s1", 3, false);
    store.showRows("s1");
    expect(subtotals(store)).toEqual([153, 153]);
  });

  it("reads the hidden rows that the workbook was loaded with", () => {
    const workbook = makeWorkbook(6);
    const [data] = workbook.sheets;
    if (!data) throw new Error("fixture has a first sheet");
    data.hiddenRows = new Set([0]);
    data.rowGroups = [{ start: 4, end: 5, collapsed: true }];

    expect(subtotals(storeWithSubtotals(workbook))).toEqual([153, 61.5]);
  });

  it("sends many hidden rows as one packed engine call, and nothing when they do not change", () => {
    const setHiddenRows = spyOn(getEngine().CellStore.prototype, "setHiddenRows");
    try {
      const store = storeWithSubtotals(makeWorkbook(2_000));
      setHiddenRows.mockClear();
      const everyOtherRow = Array.from({ length: 1_000 }, (_, index) => index * 2);

      store.hideRows("s1", everyOtherRow);
      expect(setHiddenRows).toHaveBeenCalledTimes(1);
      const [, manual, filtered] = setHiddenRows.mock.calls[0] ?? [];
      expect(manual?.length).toBe(2_000);
      expect(filtered?.length).toBe(0);

      store.sortBy("s1", 1, false);
      expect(setHiddenRows).toHaveBeenCalledTimes(1);
      // Rows 1, 3 and 5 are visible; 0.5 + 20.5 + 40.5 are hidden.
      expect(subtotals(store)).toEqual([153, 91.5]);
    } finally {
      setHiddenRows.mockRestore();
    }
  });

  it("closes the mutation when the engine rejects the hidden rows", () => {
    const store = storeWithSubtotals();
    const setHiddenRows = spyOn(getEngine().CellStore.prototype, "setHiddenRows");
    setHiddenRows.mockReturnValue(false);
    try {
      expect(() =>
        store.applyTransaction({
          patches: [
            {
              op: "set",
              addr: { sheet: "s1", row: 0, col: 1 },
              value: { kind: "literal", value: 100 },
            },
            { op: "setRowMeta", sheet: "s1", row: 1, meta: { hidden: true } },
          ],
        }),
      ).toThrow(RangeError);
      // The barrier still ran, so the edit of B1 (0.5 to 100) is recalculated.
      expect(subtotals(store)).toEqual([252.5, 252.5]);
    } finally {
      setHiddenRows.mockRestore();
    }
  });
});
