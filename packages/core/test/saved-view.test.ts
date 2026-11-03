import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook, sheet } from "./fixtures.js";

const ROWS = 6;
/** Row 1 is the only row that is not hidden, not in the collapsed group and is in Tokyo. */
const VISIBLE_ROW = 1;

beforeAll(async () => {
  await initSheetwrite();
});

const stores: SheetwriteStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
});

function keep(store: SheetwriteStore): SheetwriteStore {
  stores.push(store);
  return store;
}

/** Fixture cities repeat Phnom Penh, Tokyo, Berlin, so Tokyo is on rows 1 and 4. */
function workbookWithSavedView(): Workbook {
  const workbook = makeWorkbook(ROWS);
  const [data] = workbook.sheets;
  if (!data) throw new Error("fixture has a first sheet");

  data.hiddenRows = new Set([0]);
  data.rowGroups = [{ start: 4, end: 5, collapsed: true }];
  data.filters = [[2, { kind: "values", values: ["Tokyo"] }]];
  return workbook;
}

function visibleDataRows(store: SheetwriteStore, sheetId: string): number[] {
  const rows: number[] = [];
  for (let row = 0; row < ROWS; row++) {
    if (store.viewRowOf(sheetId, row) !== null) rows.push(row);
  }

  return rows;
}

describe("saved view state at load", () => {
  it("applies saved hidden rows, collapsed groups and filters when the store is built", () => {
    const store = keep(new SheetwriteStore(workbookWithSavedView(), makeColumnarData(ROWS)));

    expect(store.hasView("s1")).toBe(true);
    expect(store.viewRowCount("s1")).toBe(1);
    expect(visibleDataRows(store, "s1")).toEqual([VISIBLE_ROW]);
  });

  it("sends the rows of a saved filter to SUBTOTAL", () => {
    const workbook = makeWorkbook(ROWS);
    const [data] = workbook.sheets;
    if (!data) throw new Error("fixture has a first sheet");

    data.filters = [[2, { kind: "values", values: ["Tokyo"] }]];
    workbook.sheets.push(sheet("s2", 1));
    const store = keep(new SheetwriteStore(workbook, makeColumnarData(ROWS)));
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s2", row: 0, col: 0 },
          value: { kind: "formula", src: "=SUBTOTAL(9,'Sheet 1'!B1:B6)" },
        },
      ],
    });

    // Fixture amounts are row * 10 + 0.5; Tokyo rows 1 and 4 add up to 51.
    expect(store.getCell({ sheet: "s2", row: 0, col: 0 }).resolved).toBe(51);
  });

  it("applies the saved view of a snapshot after its cells load", () => {
    const source = keep(new SheetwriteStore(workbookWithSavedView(), makeColumnarData(ROWS)));
    const loaded = keep(SheetwriteStore.fromSnapshot(source.exportSnapshot()));

    expect(loaded.hasView("s1")).toBe(true);
    expect(visibleDataRows(loaded, "s1")).toEqual([VISIBLE_ROW]);
  });

  it("applies the saved view of a sheet added from a snapshot", () => {
    const source = keep(new SheetwriteStore(workbookWithSavedView(), makeColumnarData(ROWS)));
    const [saved] = source.exportSnapshot().sheets;
    if (!saved) throw new Error("snapshot has a first sheet");

    const store = keep(new SheetwriteStore(makeWorkbook(ROWS), makeColumnarData(ROWS)));
    const outcome = store.applyTransaction({
      patches: [{ op: "addSheet", sheet: { ...saved, id: "s2", name: "Copy", order: 1 } }],
    });

    expect(outcome.status).toBe("applied");
    expect(store.hasView("s2")).toBe(true);
    expect(visibleDataRows(store, "s2")).toEqual([VISIBLE_ROW]);
  });
});
