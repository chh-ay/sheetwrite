import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellStyle, Workbook } from "../src/types.js";

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

function setup(columnStyle?: CellStyle) {
  const workbook: Workbook = {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet",
        rowCount: 5,
        columns: Array.from({ length: 3 }, (_, col) => ({
          key: `c${col}`,
          header: `C${col}`,
          type: "number" as const,
          width: 100,
          cellStyle: columnStyle,
          numberFormat: "0.00",
        })),
      },
    ],
  };
  const store = new SheetwriteStore(workbook, {
    rowCount: 5,
    columns: {
      c0: [1, 2, null, null, null],
      c1: [3, 4, null, null, null],
      c2: [null, null, null, null, null],
    },
  });
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 400 } });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook }, store);
  grids.push(grid);
  const select = (row: number, col: number, endRow = row, endCol = col) =>
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row, col }, end: { row: endRow, col: endCol } },
    });
  const cell = (row: number, col: number) => store.getCell({ sheet: "s1", row, col });
  return { grid, store, select, cell };
}

it("keeps other border sides and undoes a whole edge preset once", () => {
  const { grid, select, cell } = setup();
  const left = { color: "#ff0000", width: 1 };
  grid.styleRange(
    { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
    { border: { left } },
  );
  select(0, 0, 1, 1);
  grid.actions.setBorders("outside");
  expect(cell(0, 1).style.border).toMatchObject({
    left,
    top: { style: "solid" },
    right: { style: "solid" },
  });
  expect(cell(1, 0).style.border).toMatchObject({ bottom: { style: "solid" } });
  grid.undo();
  expect(cell(0, 1).style.border).toEqual({ left });
  expect(cell(1, 0).style.border).toEqual({ left });
});

it("merges and centers in one undo step", () => {
  const { grid, store, select, cell } = setup();
  select(0, 0, 0, 1);
  grid.actions.mergeAndCenter();
  expect(cell(0, 0).style.align).toBe("center");
  expect(cell(0, 1).resolved).toBeNull();
  expect(store.getWorkbook().sheets[0]?.merges).toHaveLength(1);
  grid.undo();
  expect(cell(0, 0).style.align).toBeUndefined();
  expect(cell(0, 1).resolved).toBe(3);
  expect(store.getWorkbook().sheets[0]?.merges ?? []).toHaveLength(0);
});

it("clears contents and styles together and restores both once", () => {
  const { grid, select, cell } = setup();
  grid.styleRange(
    { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
    { bold: true },
  );
  select(0, 0, 1, 1);
  grid.actions.clearAll();
  expect(cell(0, 0).resolved).toBeNull();
  expect(cell(1, 1).style.bold).toBeUndefined();
  grid.undo();
  expect(cell(0, 0).resolved).toBe(1);
  expect(cell(1, 1).style.bold).toBe(true);
});

it("AutoSum prefers adjacent numbers above, falls back left, and otherwise does nothing", () => {
  const { grid, store, select, cell } = setup();
  select(2, 0);
  grid.actions.autoSum();
  expect(store.getFormula({ sheet: "s1", row: 2, col: 0 })).toBe("=SUM(A1:A2)");
  expect(cell(2, 0).resolved).toBe(3);
  expect(grid.getSelection()).toMatchObject({ kind: "cell", addr: { row: 2, col: 0 } });
  select(0, 2);
  grid.actions.autoSum();
  expect(store.getFormula({ sheet: "s1", row: 0, col: 2 })).toBe("=SUM(A1:B1)");
  select(4, 2);
  grid.actions.autoSum();
  expect(cell(4, 2).resolved).toBeNull();
  grid.undo();
  expect(store.getFormula({ sheet: "s1", row: 0, col: 2 })).toBeNull();
});

it("steps the focus font and number format over the selection and restores column format", () => {
  const { grid, select, cell } = setup({ fontSize: 16 });
  grid.styleRange(
    { sheet: "s1", start: { row: 1, col: 1 }, end: { row: 1, col: 1 } },
    { fontSize: 20, numberFormat: "0.0000" },
  );
  select(0, 0, 1, 1);
  grid.actions.stepFontSize(1);
  expect(cell(0, 0).style.fontSize).toBeCloseTo(64 / 3);
  expect(cell(1, 1).style.fontSize).toBeCloseTo(64 / 3);
  grid.actions.stepDecimals(1);
  expect(cell(0, 0).style.numberFormat).toBe("0.00000");
  expect(cell(1, 1).style.numberFormat).toBe("0.00000");
  grid.actions.setNumberFormat(null);
  expect(cell(0, 0).style.numberFormat).toBeUndefined();
  grid.actions.stepDecimals(-1);
  expect(cell(1, 1).style.numberFormat).toBe("0.0");
  grid.actions.setNumberFormat("General");
  grid.actions.stepDecimals(-1);
  expect(cell(1, 1).style.numberFormat).toBe("General");
});

it("tracks vertical alignment and wrap activity including mixed selections", () => {
  const { grid, select } = setup();
  select(0, 0);
  expect(grid.getCommandState("alignMiddle").activity).toBe("active");
  grid.actions.setVerticalAlign("top");
  grid.actions.toggleWrap();
  expect(grid.getCommandState("alignTop").activity).toBe("active");
  expect(grid.getCommandState("alignMiddle").activity).toBe("inactive");
  expect(grid.getCommandState("wrap").activity).toBe("active");
  select(0, 0, 1, 0);
  expect(grid.getCommandState("alignTop").activity).toBe("mixed");
  expect(grid.getCommandState("wrap").activity).toBe("mixed");
  grid.actions.setVerticalAlign("bottom");
  expect(grid.getCommandState("alignBottom").activity).toBe("active");
});

it("reads the focused data cell over its column style under an active sort", () => {
  const { grid, store, select } = setup({ fontFamily: "Arial", fontSize: 16 });
  grid.styleRange(
    { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
    { bold: true, fontSize: 20 },
  );
  grid.sortBy(0, false);
  const sortedRow = Array.from({ length: 5 }, (_, row) => row).find(
    (row) => store.dataRowAt("s1", row) === 1,
  );
  if (sortedRow === undefined) throw new Error("Sorted view lost the styled data row");
  expect(sortedRow).not.toBe(1);
  select(sortedRow, 0);
  expect(grid.getFocusCellStyle()).toMatchObject({ fontFamily: "Arial", fontSize: 20, bold: true });
});

it("freezes above the focus view row under a sort and unfreezes at A1", () => {
  const { grid, store, select } = setup();
  grid.sortBy(0, false);
  const viewRow = Array.from({ length: 5 }, (_, row) => row).find(
    (row) => row > 0 && store.dataRowAt("s1", row) !== row,
  );
  if (viewRow === undefined) throw new Error("Expected a displaced sorted row");

  select(viewRow, 1);
  grid.actions.freezePanes();
  expect(store.getWorkbook().sheets[0]).toMatchObject({ frozenRows: viewRow, frozenCols: 1 });
  grid.setSelection(null);
  grid.actions.freezePanes();
  expect(store.getWorkbook().sheets[0]).toMatchObject({ frozenRows: viewRow, frozenCols: 1 });
  select(0, 0);
  grid.actions.freezePanes();
  expect(store.getWorkbook().sheets[0]).toMatchObject({ frozenRows: 0, frozenCols: 0 });
});
