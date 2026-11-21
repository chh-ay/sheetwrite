import { afterEach, beforeAll, beforeEach, expect, it, jest } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { createSelectionStatus } from "../src/shell.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellMode, Workbook } from "../src/types.js";

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
  jest.useRealTimers();
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
  return { grid, host, selectAll };
}

it("leaves out rows a filter hides", async () => {
  const { grid, selectAll } = setup();
  grid.setColumnFilter(1, { kind: "compare", op: "gte", value: 3 });
  selectAll();

  // Only data rows 2 and 3 remain: A is blank and 2, B is 3 and 4.
  expect(await grid.summarizeSelection()).toMatchObject({ count: 3, sum: 9, min: 2, max: 4 });
});

it("shows Excel's Average, Count and Sum in the shell status line", async () => {
  const { grid, selectAll } = setup();
  const statusHost = document.createElement("div");
  const piece = createSelectionStatus(statusHost, grid);
  selectAll();

  await grid.summarizeSelection();
  expect(piece.element.textContent).toContain("Count: 7");
  expect(piece.element.textContent).toContain("Sum: 22");
  // The status line shows numbers in Excel's General display, as Excel's does.
  expect(piece.element.textContent).toContain("Average: 3.666666667");
  piece.destroy();
});

it("names a selected row by its sheet row under a filter", () => {
  const { grid } = setup();
  const piece = createSelectionStatus(document.createElement("div"), grid);
  // B keeps 3 and 4: view row 1 shows sheet row 3, labelled 4.
  grid.setColumnFilter(1, { kind: "compare", op: "gte", value: 3 });
  grid.setSelection({ kind: "row", sheet: "s1", row: 1 });
  expect(piece.element.textContent).toContain("Row 4");
  piece.destroy();
});

it("names the step an undo or redo applied, and tints its cells for a moment", () => {
  jest.useFakeTimers();
  const { grid, host } = setup();
  const statusHost = document.createElement("div");
  const piece = createSelectionStatus(statusHost, grid);
  const flashed = () => host.querySelectorAll("[data-sheetwrite-flash]").length;
  grid.setSelection({
    kind: "range",
    range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 2, col: 1 } },
  });
  grid.actions.toggleBold();
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });

  grid.undo();
  // The step leads the summary, after #849's cell mode.
  expect(piece.element.lastElementChild?.textContent).toStartWith("Undo: Format Cells in A2:B3");
  expect(flashed()).toBeGreaterThan(0);
  jest.advanceTimersByTime(600);
  grid.refresh();
  expect(flashed()).toBe(0);

  grid.redo();
  expect(piece.element.lastElementChild?.textContent).toStartWith("Redo: Format Cells in A2:B3");
  // The next selection replaces the step with the selection's own status.
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
  expect(piece.element.textContent).not.toContain("Redo");
  piece.destroy();
});

// https://support.microsoft.com/en-us/office/excel-status-bar-options-6055ecd9-e20f-4a7a-a611-4481bd488c55
it("names Excel's cell mode: Ready, Enter, Edit and Point", () => {
  const { grid } = setup();
  const piece = createSelectionStatus(document.createElement("div"), grid);
  const mode = () => piece.element.querySelector(".sheetwrite-shell-mode")?.textContent;
  const modes: CellMode[] = [];
  grid.on("cell-mode", (event) => modes.push(event.mode));
  const press = (key: string) =>
    document
      .querySelector("textarea.sheetwrite-editor")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

  expect(mode()).toBe("Ready");
  grid.beginEdit(1, 0, "x");
  expect(mode()).toBe("Enter");
  press("F2");
  expect(mode()).toBe("Edit");
  press("Escape");
  expect(mode()).toBe("Ready");
  grid.beginEdit(2, 1, "=");
  press("ArrowDown");
  expect(mode()).toBe("Point");
  expect(grid.getCellMode()).toBe("point");
  expect(modes).toEqual(["enter", "edit", "ready", "enter", "point"]);
  piece.destroy();
});

it("shows Excel's records found after an AutoFilter filters, until the next edit", () => {
  const { grid } = setup();
  const piece = createSelectionStatus(document.createElement("div"), grid);
  grid.setAutoFilter({ sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } });
  expect(piece.element.textContent).not.toContain("records found");

  grid.setColumnFilter(1, { kind: "compare", op: "gte", value: 3 });
  expect(piece.element.textContent).toContain("2 of 3 records found");
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 1 } });
  expect(piece.element.textContent).toContain("2 of 3 records found");

  grid.applyTransaction({
    patches: [
      { op: "set", addr: { sheet: "s1", row: 0, col: 0 }, value: { kind: "literal", value: 1 } },
    ],
  });
  expect(piece.element.textContent).not.toContain("records found");
  piece.destroy();
});
