import { beforeAll, describe, expect, it } from "bun:test";

import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

const ROWS = 4;
/** The engine's cell limit for one dense sheet. */
const MAX_DENSE_CELLS = 5_000_000;
/** Rows that take the three fixture columns past the dense cell limit. */
const ROWS_PAST_LIMIT = Math.ceil(MAX_DENSE_CELLS / 3);

beforeAll(async () => {
  await initSheetwrite();
});

describe("structural edits the engine cannot hold", () => {
  it("rejects a row insert past the dense cell limit and changes nothing", () => {
    const store = new SheetwriteStore(makeWorkbook(ROWS), makeColumnarData(ROWS));
    const formula = { sheet: "s1", row: 0, col: 0 };
    store.applyTransaction({
      patches: [{ op: "set", addr: formula, value: { kind: "formula", src: "=B4" } }],
    });
    expect(store.getCell(formula).resolved).toBe(30.5);

    const result = store.applyTransaction({
      patches: [{ op: "addRows", sheet: "s1", at: 0, count: ROWS_PAST_LIMIT }],
    });

    // The store drops a patch the engine refuses, as it drops an out-of-range one.
    expect(result.status).toBe("noop");
    expect(store.getWorkbook().sheets[0]?.rowCount).toBe(ROWS);
    expect(store.getCell({ sheet: "s1", row: 3, col: 1 }).resolved).toBe(30.5);
    expect(store.getCell(formula).resolved).toBe(30.5);

    // The sheet still takes an edit it can hold, and the formula follows it.
    store.applyTransaction({ patches: [{ op: "addRows", sheet: "s1", at: 0, count: 1 }] });
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe(30.5);
    store.dispose();
  });
});
