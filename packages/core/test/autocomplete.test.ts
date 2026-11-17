import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellScalar, Workbook } from "../src/types.js";
import { mountHost } from "./fixtures.js";

// Excel's AutoComplete: typing a text entry completes it from the entries
// above and below in the column.
// https://support.microsoft.com/en-us/office/turn-automatic-completion-of-cell-entries-on-or-off-0f4aa749-b927-4ff3-a8e0-28d6e2e4d4b4

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;
let grid: GridImpl;
let store: SheetwriteStore;
let host: HTMLDivElement;

/** A sheet whose column A holds `values` from A1 down, and an empty text column B. */
function mount(values: readonly CellScalar[]): void {
  const rowCount = 12;
  const workbook: Workbook = {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet1",
        rowCount,
        columns: [
          { key: "a", header: "A", type: "text", width: 100 },
          { key: "b", header: "B", type: "text", width: 100 },
        ],
      },
    ],
  };
  const a = Array.from({ length: rowCount }, (_, row) => values[row] ?? null);
  store = new SheetwriteStore(workbook, {
    rowCount,
    columns: { a, b: Array.from({ length: rowCount }, () => null) },
  });
  host = mountHost();
  grid = new GridImpl(host, { workbook }, store);
}

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  grid.destroy();
  store.dispose();
  restoreStubs();
});

function editor(): HTMLTextAreaElement {
  const field = host.querySelector<HTMLTextAreaElement>("textarea.sheetwrite-editor");
  if (field === null) throw new Error("The cell editor is not open");
  return field;
}

function key(name: string, init: KeyboardEventInit = {}): void {
  const target = host.querySelector("textarea.sheetwrite-editor") ?? host;
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }),
  );
}

/**
 * Type `text` into the active cell as a browser does: the first key opens the
 * editor, and each later key replaces the selected text and fires `input`.
 */
function type(text: string): void {
  for (const char of text) {
    if (host.querySelector("textarea.sheetwrite-editor") === null) {
      key(char);
      continue;
    }
    const field = editor();
    field.value =
      field.value.slice(0, field.selectionStart) + char + field.value.slice(field.selectionEnd);
    field.setSelectionRange(field.value.length, field.value.length);
    field.dispatchEvent(
      new InputEvent("input", { inputType: "insertText", data: char, bubbles: true }),
    );
  }
}

function at(row: number): void {
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row, col: 0 } });
}

const value = (row: number) => store.getCell({ sheet: "s1", row, col: 0 }).resolved;
const shown = () => {
  const field = editor();
  return [field.value, field.value.slice(field.selectionStart, field.selectionEnd)];
};

describe("AutoComplete", () => {
  it("completes from the entries above, with the added text selected, and Enter stores it", () => {
    mount(["Apple", "Banana"]);
    at(2);
    type("Ap");
    expect(shown()).toEqual(["Apple", "ple"]);
    key("Enter");
    expect(value(2)).toBe("Apple");
  });

  it("completes from the first letter, and Tab accepts in the entry's letter case", () => {
    mount(["Apple", "Banana"]);
    at(2);
    type("b");
    expect(shown()).toEqual(["banana", "anana"]);
    key("Tab");
    expect(value(2)).toBe("Banana");
  });

  it("uses the entries below too, but not past an empty cell", () => {
    mount([null, null, null, "Cherry", null, "Damson"]);
    at(2);
    type("Ch");
    expect(shown()).toEqual(["Cherry", "erry"]);
    key("Escape");
    type("Da");
    expect(shown()).toEqual(["Da", ""]);
  });

  it("removes the completion with Backspace, and Enter stores what was typed", () => {
    mount(["Apple", "Banana"]);
    at(2);
    type("Ap");
    expect(shown()).toEqual(["Apple", "ple"]);
    const field = editor();
    field.value = "Ap";
    field.setSelectionRange(2, 2);
    field.dispatchEvent(
      new InputEvent("input", { inputType: "deleteContentBackward", bubbles: true }),
    );
    expect(shown()).toEqual(["Ap", ""]);
    key("Enter");
    expect(value(2)).toBe("Ap");
  });

  it("does not complete while two entries match; entries that differ only in case are one", () => {
    mount(["Apple", "Apricot", "apple"]);
    at(3);
    type("Ap");
    expect(shown()).toEqual(["Ap", ""]);
    type("p");
    // "Apple" and "apple" are one entry, the first seen.
    expect(shown()).toEqual(["Apple", "le"]);
    key("Escape");
    type("Apr");
    expect(shown()).toEqual(["Apricot", "icot"]);
  });

  it("does not complete numbers or formulas, but completes text that starts with digits", () => {
    mount(["12 apples", 12_345, "=SUMMARY"]);
    at(3);
    type("12");
    expect(shown()).toEqual(["12", ""]);
    key("Escape");
    type("=SU");
    expect(editor().value).toBe("=SU");
    key("Escape");
    // "12 a" is text, so it completes.
    type("12 a");
    expect(shown()).toEqual(["12 apples", "pples"]);
  });

  it("waits for an IME composition to end", async () => {
    mount(["Tokyo", "Kyoto"]);
    at(2);
    key("T");
    const field = editor();
    field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    field.value = "To";
    field.dispatchEvent(
      new InputEvent("input", {
        inputType: "insertCompositionText",
        isComposing: true,
        bubbles: true,
      }),
    );
    expect(field.value).toBe("To");
    field.dispatchEvent(new CompositionEvent("compositionend", { data: "o", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(shown()).toEqual(["Tokyo", "kyo"]);
  });
});
