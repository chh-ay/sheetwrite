import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { expectSame } from "../../../test/expect-same.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellStyle, CellValue, DocumentOp, Grid } from "../src/types.js";
import {
  answerDialog,
  elementAdded,
  makeColumnarData,
  makeWorkbook,
  installCoreStyles,
  mountHost,
} from "./fixtures.js";

// Excel's default keys on a focused grid: the active cell, Enter and Tab,
// Ctrl+Enter, End mode, Ctrl+End, Backspace, F2, F4 and Enter mode.
// https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f

beforeAll(async () => {
  await initSheetwrite();
});

let restore_stubs: () => void;
let grid: Grid;
let store: SheetwriteStore;
let host: HTMLDivElement;

beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
  const workbook = makeWorkbook(10);
  store = new SheetwriteStore(workbook, makeColumnarData(10));
  host = mountHost();
  grid = new GridImpl(host, { workbook }, store);
});

afterEach(() => {
  grid.destroy();
  store.dispose();
  restore_stubs();
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

function select(row: number, col: number, end_row = row, end_col = col): void {
  grid.setSelection(
    row === end_row && col === end_col
      ? { kind: "cell", addr: { sheet: "s1", row, col } }
      : {
          kind: "range",
          range: { sheet: "s1", start: { row, col }, end: { row: end_row, col: end_col } },
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

  it("go to the next row in the column where a run of Tab entries started", () => {
    select(4, 0);
    type("a");
    press("Tab");
    type("2");
    press("Tab");
    type("c");
    press("Enter");
    expect([value(4, 0), value(4, 1), value(4, 2)]).toEqual(["a", 2, "c"]);
    expect(active()).toEqual({ sheet: "s1", row: 5, col: 0 });
    // Tab without typing starts a run too; any other move ends it.
    press("Tab");
    press("Enter");
    expect(active()).toEqual({ sheet: "s1", row: 6, col: 0 });
    press("Tab");
    press("ArrowDown");
    press("Enter");
    expect(active()).toEqual({ sheet: "s1", row: 8, col: 1 });
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
});

describe("the cell editor", () => {
  // #1107: Excel's in-cell editor keeps the cell's alignment and font.
  it("keeps the cell's alignment and font while it edits", () => {
    const remove_styles = installCoreStyles();
    const set = (row: number, col: number, style: CellStyle) => ({
      op: "set" as const,
      addr: { sheet: "s1", row, col },
      value: { kind: "literal" as const, value: `Cell ${row}` },
      style,
    });
    grid.applyTransaction({
      patches: [
        set(1, 0, { align: "right" }),
        set(2, 0, { align: "center" }),
        set(3, 0, { bold: true, fontSize: 14, color: "#c00000" }),
      ],
    });
    const look = (row: number, col: number) => {
      select(row, col);
      press("F2");
      const field = editor();
      if (field === null) throw new Error("The cell editor did not open");
      const style = getComputedStyle(field);
      const shown = [style.textAlign, style.fontWeight, style.fontSize, style.color];
      press("Escape");
      return shown;
    };
    try {
      expect(look(1, 0)[0]).toBe("right");
      expect(look(2, 0)[0]).toBe("center");
      const [align, weight, size, color] = look(3, 0);
      expect([align, weight, size]).toEqual(["left", "bold", "14px"]);
      // Browsers report the colour as rgb(), happy-dom as written.
      expect(["#c00000", "rgb(192, 0, 0)"]).toContain(color ?? "");
      // General alignment: the amounts column is numeric, so its values edit right-aligned.
      expect(look(4, 1)[0]).toBe("right");
    } finally {
      remove_styles();
    }
  });

  // The stylesheet already gives an unformatted cell's look; inline
  // declarations would only slow the style recalculation that focus forces.
  it("puts on inline only the look that differs from its stylesheet", () => {
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 0 },
          value: { kind: "literal", value: "Bold" },
          style: { bold: true },
        },
      ],
    });
    const inline_look = (row: number, col: number) => {
      select(row, col);
      press("F2");
      const field = editor();
      if (field === null) throw new Error("The cell editor did not open");
      const { style } = field;
      const written = {
        font: style.font !== "",
        color: style.color !== "",
        align: style.textAlign !== "",
        decoration: style.textDecoration !== "",
        pad: style.getPropertyValue("--sheetwrite-cell-pad") !== "",
      };
      press("Escape");
      return written;
    };
    const none = { font: false, color: false, align: false, decoration: false, pad: false };
    expect(inline_look(2, 0)).toEqual(none);
    expect(inline_look(1, 0)).toEqual({ ...none, font: true });
    // General alignment right-aligns the numeric amounts column.
    expect(inline_look(4, 1)).toEqual({ ...none, align: true });
  });

  it("opens with F2 with the caret at the end, where arrows move the caret, as in Excel", () => {
    select(0, 0);
    press("F2");
    const field = editor();
    expect(field?.value).toBe("Customer 0");
    expect([field?.selectionStart, field?.selectionEnd]).toEqual([10, 10]);
    expect(press("ArrowLeft").defaultPrevented).toBe(false);
    expect(editor()).not.toBeNull();
  });

  it.each([
    ["Shift+Enter, moving up", "Enter", { shiftKey: true }, 2],
    ["Ctrl+Enter, staying", "Enter", { ctrlKey: true }, 3],
    ["an arrow key, moving with it", "ArrowDown", {}, 4],
  ] as const)("commits with %s", (_, key, init, row) => {
    select(3, 2);
    type("go");
    press(key, init);
    expect(editor()).toBeNull();
    expect(value(3, 2)).toBe("go");
    expect(active()).toEqual({ sheet: "s1", row, col: 2 });
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
    const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    expect(dialog.textContent).toContain("There's a problem with this formula.");
    await answerDialog(host, "OK");
    const field = editor();
    expect(value(3, 2)).toBe("Phnom Penh");
    expectSame(document.activeElement, field);
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

describe("moving the active cell", () => {
  const merged: DocumentOp[] = [
    { op: "addMerge", sheet: "s1", merge: { r0: 1, c0: 0, r1: 2, c1: 1 } },
  ];
  // Rows 7 to 10 are empty but for A8.
  const gap: DocumentOp[] = [
    {
      op: "clearRange",
      range: { sheet: "s1", start: { row: 6, col: 0 }, end: { row: 9, col: 2 } },
    },
    { op: "set", addr: { sheet: "s1", row: 7, col: 0 }, value: { kind: "literal", value: 1 } },
  ];
  it.each([
    ["ArrowRight steps past a merged block", merged, [1, 0], [["ArrowRight"]], [1, 2]],
    ["ArrowDown steps past a merged block", merged, [1, 0], [["ArrowDown"]], [3, 0]],
    ["End then an arrow jumps to the data edge", gap, [0, 1], [["End"], ["ArrowDown"]], [5, 1]],
    ["End mode ends after one jump", gap, [0, 1], [["End"], ["ArrowDown"], ["ArrowDown"]], [6, 1]],
    ["Ctrl+End goes to the last used cell", gap, [0, 1], [["End", { ctrlKey: true }]], [7, 2]],
  ] as const)("%s, as in Excel", (_, patches, [row, col], keys, [to_row, to_col]) => {
    grid.applyTransaction({ patches: [...patches] });
    select(row, col);
    for (const [key, init] of keys) press(key, init);
    expect(active()).toEqual({ sheet: "s1", row: to_row, col: to_col });
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

describe("format keys", () => {
  const shift = (code: string) => ({ ctrlKey: true, shiftKey: true, code });
  it.each([
    ["b", { ctrlKey: true }, { bold: true }],
    ["3", { ctrlKey: true }, { italic: true }],
    ["~", shift("Backquote"), { numberFormat: "General" }],
    ["!", shift("Digit1"), { numberFormat: "#,##0.00" }],
    ["@", shift("Digit2"), { numberFormat: "h:mm AM/PM" }],
    ["#", shift("Digit3"), { numberFormat: "d-mmm-yy" }],
    ["$", shift("Digit4"), { numberFormat: "$#,##0.00_);($#,##0.00)" }],
    ["%", shift("Digit5"), { numberFormat: "0%" }],
    ["^", shift("Digit6"), { numberFormat: "0.00E+00" }],
  ] as const)("Ctrl+(Shift+)%s gives the selection Excel's %o", (key, init, style) => {
    select(0, 1, 1, 1);
    expect(press(key, init).defaultPrevented).toBe(true);
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).style).toMatchObject(style);
  });
});

describe("hide and unhide keys", () => {
  it.each([
    ["rows", "9", [2, 0, 3, 0], [1, 0, 4, 0], [2, 3], () => grid.hiddenRows()],
    ["columns", "0", [0, 1, 0, 1], [0, 0, 0, 2], [1], () => grid.hiddenColumns()],
  ] as const)(
    "hide the selected %s with Ctrl+%s and show them with Ctrl+Shift and the same digit",
    (_, digit, hide, around, hidden, read) => {
      select(hide[0], hide[1], hide[2], hide[3]);
      press(digit, { ctrlKey: true, code: `Digit${digit}` });
      expect(read()).toEqual(hidden);
      // A range around the hidden ones shows them again.
      select(around[0], around[1], around[2], around[3]);
      press(digit === "9" ? "(" : ")", { ctrlKey: true, shiftKey: true, code: `Digit${digit}` });
      expect(read()).toEqual([]);
    },
  );
});

describe("insert and delete keys", () => {
  const sheet = () => store.getWorkbook().sheets[0]!;
  const put = (...cells: [number, number, CellValue][]) =>
    store.applyTransaction({
      patches: cells.map(([row, col, cell]) => ({
        op: "set",
        addr: { sheet: "s1", row, col },
        value: cell,
      })),
    });
  /** Pick the `choice`th option of the Insert or Delete dialog and press OK. */
  const choose = async (choice: number) => {
    const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    dialog.querySelectorAll<HTMLInputElement>("input[type=radio]")[choice]!.checked = true;
    await answerDialog(host, "OK");
  };

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
    const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    const title = document.getElementById(dialog.getAttribute("aria-labelledby") ?? "");
    expect(title?.textContent).toBe("Insert");
    const choices = [...dialog.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(choices.map((radio) => [radio.parentElement?.textContent, radio.disabled])).toEqual([
      ["Shift cells right", false],
      ["Shift cells down", false],
      ["Entire row", false],
      ["Entire column", false],
    ]);
    // A wide range defaults to Shift cells down; the focus starts on the chosen option.
    expect(choices[1]!.checked).toBe(true);
    expectSame(document.activeElement, choices[1]!);
    choices[2]!.checked = true;
    await answerDialog(host, "OK");
    expect(sheet().rowCount).toBe(11);
    expect(value(2, 0)).toBe("Customer 1");
    expectSame(document.activeElement, host);

    // A tall range defaults to Shift cells left.
    select(0, 1, 3, 1);
    press("-", { ctrlKey: true, code: "Minus" });
    const remove = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    const remove_choices = [...remove.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(remove_choices.map((radio) => radio.parentElement?.textContent)).toEqual([
      "Shift cells left",
      "Shift cells up",
      "Entire row",
      "Entire column",
    ]);
    expect(remove_choices[0]?.checked).toBe(true);
  });

  // https://support.microsoft.com/en-us/office/insert-or-delete-cells-rows-and-columns-6f40e6e4-85af-45e0-b39d-65dd504a3246
  it("shift cells up and down, and the formulas that refer to them follow", async () => {
    put([0, 2, { kind: "formula", src: "=A6" }], [1, 2, { kind: "formula", src: "=A3" }]);

    // Delete A3:A4, Shift cells up: A5:A10 move to A3:A8.
    select(2, 0, 3, 0);
    press("-", { ctrlKey: true, code: "Minus" });
    await choose(1);
    expect([2, 7, 8, 9].map((row) => value(row, 0))).toEqual([
      "Customer 4",
      "Customer 9",
      null,
      null,
    ]);
    expect(formula(0, 2)).toBe("=A4");
    expect(value(0, 2)).toBe("Customer 5");
    expect(formula(1, 2)).toBe("=#REF!");
    expect(value(2, 1)).toBe(20.5);

    grid.actions.undo();
    expect(value(2, 0)).toBe("Customer 2");
    expect(formula(0, 2)).toBe("=A6");
    expect(formula(1, 2)).toBe("=A3");

    // Insert at A2, Shift cells down: A2:A10 would push Customer 9 off the sheet.
    select(1, 0);
    press("+", { ctrlKey: true, shiftKey: true, code: "Equal" });
    await choose(1);
    const notice = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    expect(notice.getAttribute("role")).toBe("alertdialog");
    expect(notice.textContent).toContain("can't be shifted off the sheet");
    await answerDialog(host, "OK");
    expect(value(1, 0)).toBe("Customer 1");

    // With A10 empty, they fit: A2:A9 move to A3:A10.
    put([9, 0, { kind: "literal", value: null }]);
    select(1, 0);
    press("+", { ctrlKey: true, shiftKey: true, code: "Equal" });
    await choose(1);
    expect([1, 2, 9].map((row) => value(row, 0))).toEqual([null, "Customer 1", "Customer 8"]);
    expect(formula(0, 2)).toBe("=A7");
    expect(formula(1, 2)).toBe("=A4");
    expect(value(1, 1)).toBe(10.5);
  });

  it("shift cells right and left along their rows", async () => {
    put([1, 2, { kind: "literal", value: null }], [5, 0, { kind: "formula", src: "=B2" }]);
    // Insert at A2 (tall), Shift cells right: A2:B2 move to B2:C2.
    select(1, 0);
    press("+", { ctrlKey: true, shiftKey: true, code: "Equal" });
    await choose(0);
    expect([0, 1, 2].map((col) => value(1, col))).toEqual([null, "Customer 1", 10.5]);
    expect(formula(5, 0)).toBe("=C2");

    // Delete A2, Shift cells left: B2:C2 move back.
    select(1, 0);
    press("-", { ctrlKey: true, code: "Minus" });
    await choose(0);
    expect([0, 1, 2].map((col) => value(1, col))).toEqual(["Customer 1", 10.5, null]);
    expect(formula(5, 0)).toBe("=B2");
  });
});
