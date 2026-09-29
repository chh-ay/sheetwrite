import { beforeAll, describe, expect, it } from "bun:test";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

// Fixture: 20 rows; col2 cycles [Phnom Penh, Tokyo, Berlin] — "Tokyo" lands where r % 3 === 1.
function store(): SheetwriteStore {
  return new SheetwriteStore(makeWorkbook(20), makeColumnarData(20));
}

describe("SheetwriteStore.searchCells", () => {
  it("matches case-insensitively by substring, row-major", () => {
    const matches = store().searchCells("s1", "tokyo");

    expect(matches.length).toBe(7);
    expect(matches.every((m) => m.col === 2)).toBe(true);
    expect(matches.map((m) => m.row)).toEqual([1, 4, 7, 10, 13, 16, 19]);
  });

  it("exposes flat row-major matches without per-cell objects", () => {
    expect(Array.from(store().searchCellsFlat("s1", "tokyo"))).toEqual([
      1, 2, 4, 2, 7, 2, 10, 2, 13, 2, 16, 2, 19, 2,
    ]);
  });

  it("honors wholeCell", () => {
    expect(store().searchCells("s1", "Tok", { wholeCell: true })).toHaveLength(0);
    expect(store().searchCells("s1", "Tokyo", { wholeCell: true })).toHaveLength(7);
  });
});
