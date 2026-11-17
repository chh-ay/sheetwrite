import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid } from "../src/types.js";
import {
  answerDialog,
  elementAdded,
  makeColumnarData,
  makeWorkbook,
  mountHost,
} from "./fixtures.js";

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

  it("points at sheet rows under a filter, as Excel does", () => {
    // Rows 4 to 10 stay visible: the amounts from 30.5.
    grid.setColumnFilter(1, { kind: "compare", op: "gte", value: 30 });
    // View row 4 is sheet row 8.
    select(4, 2);
    type("=");
    // The editor names the row as the row header shows it.
    expect(editor()?.getAttribute("aria-label")).toBe("Edit C, row 8");
    press("ArrowUp");
    expect(editor()?.value).toBe("=C7");
    press("ArrowUp", { shiftKey: true });
    expect(editor()?.value).toBe("=C6:C7");
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

  // https://support.microsoft.com/en-us/excel/how-to-avoid-broken-formulas-in-excel
  it("refuses a formula that does not parse and adds missing closing parentheses", async () => {
    select(3, 2);
    type("=SUM(A1:A3))+");
    press("Enter");
    expect(editor()?.value).toBe("=SUM(A1:A3))+");
    const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDivElement);
    expect(dialog.textContent).toContain("There's a problem with this formula.");
    await answerDialog(host, "OK");
    const field = editor();
    expect(value(3, 2)).toBe("Phnom Penh");
    expect(document.activeElement).toBe(field);
    expect([field?.selectionStart, field?.selectionEnd]).toEqual([11, 12]);
    press("Escape");

    select(4, 2);
    type("=SUMM(A1:A3");
    press("Enter");
    expect(formula(4, 2)).toBe("=SUMM(A1:A3)");
    expect(active()).toEqual({ sheet: "s1", row: 5, col: 2 });
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

describe("number-format keys", () => {
  it("apply Excel's formats with Ctrl+Shift+~ ! @ # $ % ^", () => {
    select(0, 1, 1, 1);
    const keys = [
      ["~", "Backquote", "General"],
      ["!", "Digit1", "#,##0.00"],
      ["@", "Digit2", "h:mm AM/PM"],
      ["#", "Digit3", "d-mmm-yy"],
      ["$", "Digit4", "$#,##0.00_);($#,##0.00)"],
      ["%", "Digit5", "0%"],
      ["^", "Digit6", "0.00E+00"],
    ] as const;
    for (const [key, code, format] of keys) {
      const event = press(key, { ctrlKey: true, shiftKey: true, code });
      expect(event.defaultPrevented).toBe(true);
      expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).style.numberFormat).toBe(format);
    }
  });
});

describe("hide and unhide keys", () => {
  it("hide the selected rows with Ctrl+9 and show them with Ctrl+Shift+9", () => {
    select(2, 0, 3, 0);
    press("9", { ctrlKey: true, code: "Digit9" });
    expect(grid.hiddenRows()).toEqual([2, 3]);
    // A range around the hidden rows shows them again.
    select(1, 0, 4, 0);
    press("(", { ctrlKey: true, shiftKey: true, code: "Digit9" });
    expect(grid.hiddenRows()).toEqual([]);
  });

  it("hide the selected columns with Ctrl+0 and show them with Ctrl+Shift+0", () => {
    select(0, 1);
    press("0", { ctrlKey: true, code: "Digit0" });
    expect(grid.hiddenColumns()).toEqual([1]);
    select(0, 0, 0, 2);
    press(")", { ctrlKey: true, shiftKey: true, code: "Digit0" });
    expect(grid.hiddenColumns()).toEqual([]);
  });
});

describe("insert and delete keys", () => {
  const sheet = () => store.getWorkbook().sheets[0]!;

  it("insert whole rows with Ctrl++ and delete them with Ctrl+-", () => {
    grid.setSelection({ kind: "row", sheet: "s1", row: 2 });
    press("+", { ctrlKey: true, shiftKey: true, code: "Equal" });
    expect(sheet().rowCount).toBe(11);
    expect(value(2, 0)).toBeNull();
    expect(value(3, 0)).toBe("Customer 2");
    // The keypad + inserts too.
    grid.setSelection({ kind: "row", sheet: "s1", row: 2 });
    press("+", { ctrlKey: true, code: "NumpadAdd" });
    expect(sheet().rowCount).toBe(12);
    // A range of a few columns is not a whole row; Shift+Space selects one.
    grid.setSelection({ kind: "row", sheet: "s1", row: 2 });
    press("-", { ctrlKey: true, code: "Minus" });
    grid.setSelection({ kind: "row", sheet: "s1", row: 2 });
    press("-", { ctrlKey: true, code: "NumpadSubtract" });
    expect(sheet().rowCount).toBe(10);
    expect(value(2, 0)).toBe("Customer 2");
  });

  it("insert and delete whole columns", () => {
    grid.setSelection({ kind: "column", sheet: "s1", col: 1 });
    press("+", { ctrlKey: true, shiftKey: true, code: "Equal" });
    expect(sheet().columns).toHaveLength(4);
    expect(value(0, 2)).toBe(0.5);
    press("-", { ctrlKey: true, code: "Minus" });
    expect(sheet().columns).toHaveLength(3);
    expect(value(0, 1)).toBe(0.5);
  });

  it("ask in Excel's Insert dialog for any other range", async () => {
    select(1, 0, 1, 1);
    press("+", { ctrlKey: true, shiftKey: true, code: "Equal" });
    const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDivElement);
    expect(dialog.getAttribute("role")).toBe("dialog");
    const title = document.getElementById(dialog.getAttribute("aria-labelledby") ?? "");
    expect(title?.textContent).toBe("Insert");
    const choices = [...dialog.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(choices.map((radio) => [radio.parentElement?.textContent, radio.disabled])).toEqual([
      ["Shift cells right", true],
      ["Shift cells down", true],
      ["Entire row", false],
      ["Entire column", false],
    ]);
    // A wide range defaults to rows; the focus starts on the chosen option.
    expect(document.activeElement).toBe(choices[2]!);
    await answerDialog(host, "OK");
    expect(sheet().rowCount).toBe(11);
    expect(value(2, 0)).toBe("Customer 1");
    expect(document.activeElement).toBe(host);

    // A tall range defaults to columns, and Escape cancels.
    select(0, 1, 3, 1);
    press("-", { ctrlKey: true, code: "Minus" });
    const remove = await elementAdded(host, ".sheetwrite-dialog", HTMLDivElement);
    const removeChoices = [...remove.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(removeChoices.map((radio) => radio.parentElement?.textContent)).toEqual([
      "Shift cells left",
      "Shift cells up",
      "Entire row",
      "Entire column",
    ]);
    expect(removeChoices[3]?.checked).toBe(true);
    remove.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(remove.isConnected).toBe(false);
    expect(sheet().columns).toHaveLength(3);
  });
});
