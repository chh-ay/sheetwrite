import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid } from "../src/types.js";
import { makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

// Excel's default keys on a focused grid: the active cell, Enter and Tab,
// Ctrl+Enter, End mode, Ctrl+End, Backspace, F2, F4 and Enter mode.
// https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;
let grid: Grid;
let store: SheetwriteStore;
let host: HTMLDivElement;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
  const workbook = makeWorkbook(10);
  store = new SheetwriteStore(workbook, makeColumnarData(10));
  host = mountHost();
  grid = new GridImpl(host, { workbook }, store);
});

afterEach(() => {
  grid.destroy();
  store.dispose();
  restoreStubs();
});

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const target = editor() ?? host;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function editor(): HTMLTextAreaElement | null {
  return host.querySelector<HTMLTextAreaElement>("textarea.sheetwrite-editor");
}

/** Type `text` the way a user does: the first key opens the editor, the rest are input. */
function type(text: string): void {
  const [first = "", ...rest] = Array.from(text);
  if (editor() === null) press(first);
  else rest.unshift(first);
  const field = editor();
  if (field === null) throw new Error("The cell editor did not open");
  field.value += rest.join("");
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function select(row: number, col: number, endRow = row, endCol = col): void {
  grid.setSelection(
    row === endRow && col === endCol
      ? { kind: "cell", addr: { sheet: "s1", row, col } }
      : {
          kind: "range",
          range: { sheet: "s1", start: { row, col }, end: { row: endRow, col: endCol } },
        },
  );
}

const value = (row: number, col: number) => store.getCell({ sheet: "s1", row, col }).resolved;
const formula = (row: number, col: number) => store.getFormula({ sheet: "s1", row, col });
const active = () => {
  const selection = grid.getSelection();
  if (selection?.kind === "cell") return selection.addr;
  return selection !== null && "active" in selection ? (selection.active ?? null) : null;
};

describe("Enter and Tab on a selected cell", () => {
  it("move the active cell without opening the editor", () => {
    select(3, 1);
    press("Enter");
    expect(editor()).toBeNull();
    expect(active()).toEqual({ sheet: "s1", row: 4, col: 1 });
    press("Enter", { shiftKey: true });
    expect(active()).toEqual({ sheet: "s1", row: 3, col: 1 });
    const tab = press("Tab");
    expect(tab.defaultPrevented).toBe(true);
    expect(active()).toEqual({ sheet: "s1", row: 3, col: 2 });
    press("Tab", { shiftKey: true });
    expect(active()).toEqual({ sheet: "s1", row: 3, col: 1 });
  });

  it("move within a selected range, wrap at its edges and keep the range", () => {
    select(1, 0, 2, 1);
    press("Enter");
    expect(grid.getSelection()).toEqual({
      kind: "range",
      range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 2, col: 1 } },
      active: { sheet: "s1", row: 2, col: 0 },
    });
    press("Enter");
    expect(active()).toEqual({ sheet: "s1", row: 1, col: 1 });
    press("Tab");
    expect(active()).toEqual({ sheet: "s1", row: 2, col: 0 });
    press("Tab", { shiftKey: true });
    expect(active()).toEqual({ sheet: "s1", row: 1, col: 1 });
  });

  it("enter a column of values into a selected range", () => {
    select(1, 2, 2, 2);
    type("x");
    press("Enter");
    type("y");
    press("Enter");
    expect([value(1, 2), value(2, 2)]).toEqual(["x", "y"]);
    expect(grid.getSelection()).toEqual({
      kind: "range",
      range: { sheet: "s1", start: { row: 1, col: 2 }, end: { row: 2, col: 2 } },
    });
  });
});

describe("the active cell", () => {
  it("stays where Shift+Arrow started, so typing edits it", () => {
    select(0, 0);
    press("ArrowDown", { shiftKey: true });
    press("ArrowDown", { shiftKey: true });
    expect(grid.getSelection()).toEqual({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 2, col: 0 } },
    });
    type("top");
    press("Escape");
    press("ArrowUp", { shiftKey: true });
    expect(grid.getSelection()).toEqual({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    });
    type("top");
    press("Enter");
    expect(value(0, 0)).toBe("top");
    expect(value(2, 0)).toBe("Customer 2");
  });
});

describe("Ctrl+Enter", () => {
  it("fills every selected cell, shifting relative references, and keeps the selection", () => {
    select(0, 2, 2, 2);
    type("=A1");
    press("Enter", { ctrlKey: true });
    expect([formula(0, 2), formula(1, 2), formula(2, 2)]).toEqual(["=A1", "=A2", "=A3"]);
    expect(grid.getSelection()).toEqual({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 2 }, end: { row: 2, col: 2 } },
    });
  });

  it("commits one cell and stays on it", () => {
    select(4, 2);
    type("z");
    press("Enter", { ctrlKey: true });
    expect(value(4, 2)).toBe("z");
    expect(active()).toEqual({ sheet: "s1", row: 4, col: 2 });
  });
});

describe("the cell editor", () => {
  it("opens with F2 with the caret at the end, as in Excel", () => {
    select(0, 0);
    press("F2");
    const field = editor();
    expect(field?.value).toBe("Customer 0");
    expect([field?.selectionStart, field?.selectionEnd]).toEqual([10, 10]);
  });

  it("commits with Shift+Enter and moves up", () => {
    select(3, 2);
    type("up");
    press("Enter", { shiftKey: true });
    expect(value(3, 2)).toBe("up");
    expect(active()).toEqual({ sheet: "s1", row: 2, col: 2 });
  });

  it("commits with an arrow key after typing, and moves the caret after F2", () => {
    select(3, 2);
    type("go");
    press("ArrowDown");
    expect(editor()).toBeNull();
    expect(value(3, 2)).toBe("go");
    expect(active()).toEqual({ sheet: "s1", row: 4, col: 2 });

    select(3, 0);
    press("F2");
    const left = press("ArrowLeft");
    expect(left.defaultPrevented).toBe(false);
    expect(editor()).not.toBeNull();
  });

  it("points at cells with arrow keys in a formula", () => {
    select(3, 2);
    type("=");
    press("ArrowUp");
    expect(editor()?.value).toBe("=C3");
    press("ArrowLeft");
    expect(editor()?.value).toBe("=B3");
    press("ArrowUp", { shiftKey: true });
    expect(editor()?.value).toBe("=B2:B3");
    type("+");
    press("ArrowLeft");
    expect(editor()?.value).toBe("=B2:B3+B4");
  });

  it("cycles the reference at the caret with F4", () => {
    select(3, 2);
    type("=SUM(A1:B2)+A1");
    const field = editor();
    if (field === null) throw new Error("The cell editor did not open");
    field.setSelectionRange(9, 9);
    const steps: string[] = [];
    for (let index = 0; index < 4; index++) {
      press("F4");
      steps.push(field.value);
    }
    expect(steps).toEqual([
      "=SUM($A$1:$B$2)+A1",
      "=SUM(A$1:B$2)+A1",
      "=SUM($A1:$B2)+A1",
      "=SUM(A1:B2)+A1",
    ]);
  });
});

describe("Ctrl+A", () => {
  it("selects the current region, then the whole sheet, keeping the active cell", () => {
    grid.applyTransaction({
      patches: [
        {
          op: "clearRange",
          range: { sheet: "s1", start: { row: 5, col: 0 }, end: { row: 5, col: 2 } },
        },
      ],
    });
    select(2, 1);
    press("a", { ctrlKey: true });
    expect(grid.getSelection()).toEqual({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 4, col: 2 } },
      active: { sheet: "s1", row: 2, col: 1 },
    });
    press("a", { ctrlKey: true });
    expect(grid.getSelection()).toEqual({
      kind: "range",
      // The whole sheet runs to the grid's last column, which includes empty display columns.
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 9, col: expect.any(Number) } },
      active: { sheet: "s1", row: 2, col: 1 },
    });
  });
});

describe("arrow keys on a merged cell", () => {
  it("step past the whole merged block, as in Excel", () => {
    grid.applyTransaction({
      patches: [{ op: "addMerge", sheet: "s1", merge: { r0: 1, c0: 0, r1: 2, c1: 1 } }],
    });
    select(1, 0);
    press("ArrowRight");
    expect(active()).toEqual({ sheet: "s1", row: 1, col: 2 });
    select(1, 0);
    press("ArrowDown");
    expect(active()).toEqual({ sheet: "s1", row: 3, col: 0 });
  });
});

describe("End, Ctrl+End and Backspace", () => {
  it("jumps to the data edge with End then an arrow, and to the last used cell with Ctrl+End", () => {
    grid.applyTransaction({
      patches: [
        {
          op: "clearRange",
          range: { sheet: "s1", start: { row: 6, col: 0 }, end: { row: 9, col: 2 } },
        },
        { op: "set", addr: { sheet: "s1", row: 7, col: 0 }, value: { kind: "literal", value: 1 } },
      ],
    });
    select(0, 1);
    press("End");
    expect(active()).toEqual({ sheet: "s1", row: 0, col: 1 });
    press("ArrowDown");
    expect(active()).toEqual({ sheet: "s1", row: 5, col: 1 });
    press("ArrowDown");
    expect(active()).toEqual({ sheet: "s1", row: 6, col: 1 });
    press("End", { ctrlKey: true });
    expect(active()).toEqual({ sheet: "s1", row: 7, col: 2 });
  });

  it("clears only the active cell with Backspace and opens it; Escape restores it", () => {
    select(0, 0, 1, 0);
    press("Backspace");
    expect(editor()?.value).toBe("");
    press("Escape");
    expect(value(0, 0)).toBe("Customer 0");
    press("Backspace");
    press("Enter");
    expect([value(0, 0), value(1, 0)]).toEqual([null, "Customer 1"]);
  });
});

describe("formatting and date keys", () => {
  it("toggles bold with Ctrl+B and italic with Ctrl+3", () => {
    select(0, 0, 1, 0);
    press("b", { ctrlKey: true });
    press("3", { ctrlKey: true });
    const style = store.getCell({ sheet: "s1", row: 1, col: 0 }).style;
    expect([style.bold, style.italic]).toEqual([true, true]);
  });

  it("enters today's date with Ctrl+; as a formatted date serial", () => {
    select(2, 1);
    press(";", { ctrlKey: true, code: "Semicolon" });
    const cell = store.getCell({ sheet: "s1", row: 2, col: 1 });
    const today = new Date();
    const expected =
      (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(1899, 11, 30)) /
      86_400_000;
    expect(cell.resolved).toBe(expected);
    expect(cell.style.numberFormat).toBe("m/d/yyyy");
  });
});
