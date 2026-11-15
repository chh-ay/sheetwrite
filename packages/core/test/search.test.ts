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
  it("honors wholeCell", () => {
    expect(store().searchCells("s1", "Tok", { wholeCell: true })).toHaveLength(0);
    expect(store().searchCells("s1", "Tokyo", { wholeCell: true })).toHaveLength(7);
  });
});
