import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { createSelectionStatus } from "../src/shell.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Workbook } from "../src/types.js";

let restore: () => void;
const grids: GridImpl[] = [];

beforeAll(async () => {
  await initSheetwrite();
});
beforeEach(() => {
  restore = installCanvasTestStubs();
});
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  document.body.replaceChildren();
  restore();
});

// Column A mixes numbers, text and a blank; column B is all numbers.
function setup() {
  const workbook: Workbook = {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet",
        rowCount: 4,
        columns: [
          { key: "a", header: "A", type: "text", width: 100 },
          { key: "b", header: "B", type: "number", width: 100 },
        ],
      },
    ],
  };
  const store = new SheetwriteStore(workbook, {
    rowCount: 4,
    columns: { a: [10, "note", null, 2], b: [1, 2, 3, 4] },
  });
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 400 } });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook }, store);
  grids.push(grid);

  const selectAll = () =>
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } },
    });
  return { grid, selectAll };
}

it("totals the selected values, counting text but summing only numbers", async () => {
  const { grid, selectAll } = setup();
  expect(await grid.summarizeSelection()).toBeNull();

  selectAll();
  expect(await grid.summarizeSelection()).toEqual({
    count: 7,
    numericCount: 6,
    sum: 22,
    average: 22 / 6,
    min: 1,
    max: 10,
  });
});

it("leaves out rows a filter hides", async () => {
  const { grid, selectAll } = setup();
  grid.setColumnFilter(1, { kind: "compare", op: "gte", value: 3 });
  selectAll();

  // Only data rows 2 and 3 remain: A is blank and 2, B is 3 and 4.
  expect(await grid.summarizeSelection()).toMatchObject({ count: 3, sum: 9, min: 2, max: 4 });
});

it("rejects with the abort reason once aborted", async () => {
  const { grid, selectAll } = setup();
  selectAll();
  const controller = new AbortController();
  controller.abort(new Error("stale"));

  await expect(grid.summarizeSelection(controller.signal)).rejects.toThrow("stale");
});

it("shows Excel's Average, Count and Sum in the shell status line", async () => {
  const { grid, selectAll } = setup();
  const statusHost = document.createElement("div");
  const piece = createSelectionStatus(statusHost, grid);
  selectAll();

  await grid.summarizeSelection();
  expect(piece.element.textContent).toContain("Count: 7");
  expect(piece.element.textContent).toContain("Sum: 22");
  // The status line uses the grid's General number display, not full precision.
  expect(piece.element.textContent).toMatch(/Average: 3\.66?7/);
  piece.destroy();
});
