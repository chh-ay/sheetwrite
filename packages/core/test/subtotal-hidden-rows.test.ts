import { afterEach, beforeAll, describe, expect, it, spyOn } from "bun:test";

import { getEngine } from "../src/engine.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook, sheet } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

const ROWS = 6;
/** Row 1 is the only row that is not hidden, not in the collapsed group and is in Tokyo. */
const VISIBLE_ROW = 1;

const stores: SheetwriteStore[] = [];

function keep(store: SheetwriteStore): SheetwriteStore {
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
});

/**
 * Sheet 1 holds the fixture rows (amounts 0.5, 10.5, … 50.5; cities Phnom
 * Penh, Tokyo, Berlin repeating); sheet s2 holds the subtotals over them.
 */
function store_with_subtotals(workbook: Workbook = makeWorkbook(ROWS)): SheetwriteStore {
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

/** Tokyo rows 1 and 4 pass the filter; row 0 is hidden and rows 4-5 are a collapsed group. */
function workbook_with_saved_view(): Workbook {
  const workbook = makeWorkbook(ROWS);
  const [data] = workbook.sheets;
  if (!data) throw new Error("fixture has a first sheet");

  data.hiddenRows = new Set([0]);
  data.rowGroups = [{ start: 4, end: 5, collapsed: true }];
  data.filters = [[2, { kind: "values", values: ["Tokyo"] }]];
  return workbook;
}

function visible_data_rows(store: SheetwriteStore, sheet_id: string): number[] {
  const rows: number[] = [];
  for (let row = 0; row < ROWS; row++) {
    if (store.viewRowOf(sheet_id, row) !== null) rows.push(row);
  }

  return rows;
}

function subtotals(store: SheetwriteStore): unknown[] {
  return [0, 1].map((row) => store.getCell({ sheet: "s2", row, col: 0 }).resolved);
}

describe("SUBTOTAL over hidden rows", () => {
  it("skips filtered rows for every code and rows hidden by hand or by a group for 101-111", () => {
    const store = store_with_subtotals();
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

  it("reads the hidden rows and filters that the workbook was loaded with", () => {
    expect(subtotals(store_with_subtotals(workbook_with_saved_view()))).toEqual([51, 10.5]);
  });

  it("closes the mutation when the engine rejects the hidden rows", () => {
    const store = store_with_subtotals();
    const set_hidden_rows = spyOn(getEngine().CellStore.prototype, "setHiddenRows");
    set_hidden_rows.mockReturnValue(false);
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
      set_hidden_rows.mockRestore();
    }
  });
});

describe("saved view state at load", () => {
  it("applies saved hidden rows, collapsed groups and filters when the store is built", () => {
    const store = keep(new SheetwriteStore(workbook_with_saved_view(), makeColumnarData(ROWS)));

    expect(store.hasView("s1")).toBe(true);
    expect(store.viewRowCount("s1")).toBe(1);
    expect(visible_data_rows(store, "s1")).toEqual([VISIBLE_ROW]);
  });

  it("applies the saved view of a snapshot after its cells load", () => {
    const source = keep(new SheetwriteStore(workbook_with_saved_view(), makeColumnarData(ROWS)));
    const loaded = keep(SheetwriteStore.fromSnapshot(source.exportSnapshot()));

    expect(loaded.hasView("s1")).toBe(true);
    expect(visible_data_rows(loaded, "s1")).toEqual([VISIBLE_ROW]);
  });

  it("applies the saved view of a sheet added from a snapshot", () => {
    const source = keep(new SheetwriteStore(workbook_with_saved_view(), makeColumnarData(ROWS)));
    const [saved] = source.exportSnapshot().sheets;
    if (!saved) throw new Error("snapshot has a first sheet");

    const store = keep(new SheetwriteStore(makeWorkbook(ROWS), makeColumnarData(ROWS)));
    const outcome = store.applyTransaction({
      patches: [{ op: "addSheet", sheet: { ...saved, id: "s2", name: "Copy", order: 1 } }],
    });

    expect(outcome.status).toBe("applied");
    expect(store.hasView("s2")).toBe(true);
    expect(visible_data_rows(store, "s2")).toEqual([VISIBLE_ROW]);
  });
});
