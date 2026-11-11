import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { sortPanel } from "../src/panels/sort-panel.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellScalar, Workbook } from "../src/types.js";

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

const ROWS = 8;

/** A1:B4 holds a header and three rows; D1 is outside the current region. */
function setup() {
  const workbook: Workbook = {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet",
        rowCount: ROWS,
        columns: ["Name", "Qty", "Gap", "Other"].map((header, col) => ({
          key: `c${col}`,
          header,
          type: "text" as const,
          width: 100,
        })),
      },
    ],
  };
  const blanks = (): CellScalar[] => Array.from({ length: ROWS }, () => null);
  const store = new SheetwriteStore(workbook, {
    rowCount: ROWS,
    columns: {
      c0: ["Name", "pear", "apple", "fig", null, null, null, null],
      c1: ["Qty", 3, 1, 2, null, null, null, null],
      c2: blanks(),
      c3: ["keep", "x", "y", "z", null, null, null, null],
    },
  });
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 400 } });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook }, store);
  grids.push(grid);
  const column = (col: number) =>
    [0, 1, 2, 3].map((row) => store.getCell({ sheet: "s1", row, col }).resolved);
  const focus = (row: number, col: number) =>
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row, col } });
  return { grid, store, column, focus };
}

it("quick sort moves the cells of the current region and keeps its header", () => {
  const { grid, column, focus } = setup();
  focus(2, 1);

  expect(grid.sortBy(1, true).status).toBe("applied");

  expect(column(0)).toEqual(["Name", "apple", "fig", "pear"]);
  expect(column(1)).toEqual(["Qty", 1, 2, 3]);
  expect(column(3)).toEqual(["keep", "x", "y", "z"]);
});

it("one undo restores the cells after a quick sort", () => {
  const { grid, column, focus } = setup();
  focus(1, 0);
  grid.sortBy(0, false);

  grid.undo();

  expect(column(0)).toEqual(["Name", "pear", "apple", "fig"]);
});

it("quick sort in a table sorts the table body", () => {
  const { grid, store, column, focus } = setup();
  store.applyTransaction({
    patches: [
      {
        op: "addTable",
        table: {
          id: "t1",
          name: "Fruit",
          range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } },
          columns: [
            { id: "name", name: "Name" },
            { id: "qty", name: "Qty" },
          ],
          headerRow: true,
          totalsRow: false,
        },
      },
    ],
  });
  focus(1, 0);

  grid.sortBy(0, true);

  expect(column(0)).toEqual(["Name", "apple", "fig", "pear"]);
  expect(column(1)).toEqual(["Qty", 1, 2, 3]);
});

it("the Sort panel sorts the cells by several levels, or only the view", () => {
  const { grid, column, focus } = setup();
  focus(1, 0);
  const body = document.createElement("div");
  document.body.append(body);
  const cleanup = sortPanel(grid).render(body);
  const form = body.querySelector("form");
  const order = body.querySelector<HTMLSelectElement>('[data-focus-key="sort-order-0"]');
  const viewOnly = body.querySelector<HTMLInputElement>('[data-focus-key="sort-view-only"]');
  if (!form || !order || !viewOnly) throw new Error("The Sort panel did not render its form");

  order.value = "descending";
  order.dispatchEvent(new Event("change"));
  form.requestSubmit();
  expect(column(0)).toEqual(["Name", "pear", "fig", "apple"]);

  viewOnly.checked = true;
  viewOnly.dispatchEvent(new Event("change"));
  order.value = "ascending";
  order.dispatchEvent(new Event("change"));
  form.requestSubmit();
  expect(column(0)).toEqual(["Name", "pear", "fig", "apple"]);
  expect(grid.store.getWorkbook().sheets[0]?.sortKeys).toEqual([{ col: 0, ascending: true }]);
  cleanup();
});
