import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { createGrid, initSheetwrite } from "../src/index.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { makeWorkbook } from "./fixtures.js";

const INITIAL_ROWS = 1_000_000;
const INSERTED_ROWS = 5;
let restoreCanvas: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
});

afterEach(() => {
  restoreCanvas();
});

it("inserts and removes rows above the snapshot admission limit in a live grid", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const amounts = new Float64Array(INITIAL_ROWS);
  amounts[0] = 10;
  amounts[1] = 20;
  const grid = createGrid(host, {
    workbook: makeWorkbook(INITIAL_ROWS),
    data: { rowCount: INITIAL_ROWS, columns: { amount: amounts } },
  });
  const amountAt = (row: number) => grid.store.getCell({ sheet: "s1", row, col: 1 }).resolved;

  try {
    const inserted = grid.store.applyTransaction({
      patches: [{ op: "addRows", sheet: "s1", at: 1, count: INSERTED_ROWS }],
    });
    expect(inserted.status).toBe("applied");
    grid.refresh();

    expect(grid.store.viewRowCount("s1")).toBe(INITIAL_ROWS + INSERTED_ROWS);
    expect(amountAt(0)).toBe(10);
    expect(amountAt(1 + INSERTED_ROWS)).toBe(20);

    const removed = grid.store.applyTransaction({
      patches: [{ op: "removeRows", sheet: "s1", at: 1, count: INSERTED_ROWS }],
    });
    expect(removed.status).toBe("applied");
    grid.refresh();

    expect(grid.store.viewRowCount("s1")).toBe(INITIAL_ROWS);
    expect(amountAt(0)).toBe(10);
    expect(amountAt(1)).toBe(20);
  } finally {
    grid.destroy();
    host.remove();
  }
});
