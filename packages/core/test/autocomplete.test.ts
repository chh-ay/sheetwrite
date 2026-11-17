import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellScalar, GridConfig, Workbook } from "../src/types.js";
import { elementAdded, mountHost } from "./fixtures.js";

// Excel's AutoComplete: typing a text entry completes it from the entries
// above and below in the column.
// https://support.microsoft.com/en-us/office/turn-automatic-completion-of-cell-entries-on-or-off-0f4aa749-b927-4ff3-a8e0-28d6e2e4d4b4

beforeAll(async () => {
  await initSheetwrite();
  // Load the chunk once, so each edit gets it within a turn.
  await import("../src/autocomplete.js");
});

let restoreStubs: () => void;
let grid: GridImpl;
let store: SheetwriteStore;
let host: HTMLDivElement;

/**
 * A sheet of `rows` rows (12 unless given) whose column A holds `values` from
 * A1 down, and an empty text column B.
 */
function mount(
  values: readonly CellScalar[],
  { rows: rowCount = 12, config }: { rows?: number; config?: GridConfig } = {},
): void {
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
  grid = new GridImpl(host, { workbook, config }, store);
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
async function type(text: string): Promise<void> {
  for (const char of text) {
    if (host.querySelector("textarea.sheetwrite-editor") === null) {
      key(char);
      // AutoComplete loads with the first edit and completes once it arrives.
      await new Promise((resolve) => setTimeout(resolve, 0));
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
  it("completes from the entries above, with the added text selected, and Enter stores it", async () => {
    mount(["Apple", "Banana"]);
    at(2);
    await type("Ap");
    expect(shown()).toEqual(["Apple", "ple"]);
    key("Enter");
    expect(value(2)).toBe("Apple");
  });

  it("completes from the first letter, and Tab accepts in the entry's letter case", async () => {
    mount(["Apple", "Banana"]);
    at(2);
    await type("b");
    expect(shown()).toEqual(["banana", "anana"]);
    key("Tab");
    expect(value(2)).toBe("Banana");
  });

  it("uses the entries below too, but not past an empty cell", async () => {
    mount([null, null, null, "Cherry", null, "Damson"]);
    at(2);
    await type("Ch");
    expect(shown()).toEqual(["Cherry", "erry"]);
    key("Escape");
    await type("Da");
    expect(shown()).toEqual(["Da", ""]);
  });

  it.each([
    ["Backspace", "deleteContentBackward"],
    ["Delete", "deleteContentForward"],
  ])("removes the completion with %s, and Enter stores what was typed", async (_, inputType) => {
    mount(["Apple", "Banana"]);
    at(2);
    await type("Ap");
    expect(shown()).toEqual(["Apple", "ple"]);
    const field = editor();
    field.value = "Ap";
    field.setSelectionRange(2, 2);
    field.dispatchEvent(new InputEvent("input", { inputType, bubbles: true }));
    expect(shown()).toEqual(["Ap", ""]);
    key("Enter");
    expect(value(2)).toBe("Ap");
  });

  it("completes text with a hyphen, a slash or other pattern characters", async () => {
    mount(["Well-known (a/b) $1.5", "Banana"]);
    at(2);
    await type("well-known (a/");
    expect(shown()).toEqual(["well-known (a/b) $1.5", "b) $1.5"]);
    key("Enter");
    expect(value(2)).toBe("Well-known (a/b) $1.5");
  });

  it("does not complete while the host turns AutoComplete off", async () => {
    mount(["Apple", "Banana"], { config: { toolbar: false, autoComplete: false } });
    at(2);
    await type("Ap");
    expect(shown()).toEqual(["Ap", ""]);
    key("Escape");
    grid.setConfig({ toolbar: false });
    await type("Ap");
    expect(shown()).toEqual(["Apple", "ple"]);
  });

  it("reads at most 100,000 entries each way from the edited cell", async () => {
    // Zebra is the 100,001st entry above row 100,001 and the 100,000th above row 100,000.
    mount(["Zebra", ...Array.from({ length: 100_000 }, () => "Yak")], { rows: 100_002 });
    at(100_001);
    await type("Z");
    expect(shown()).toEqual(["Z", ""]);
    key("Escape");
    at(100_000);
    await type("Z");
    expect(shown()).toEqual(["Zebra", "ebra"]);
  });

  it("does not complete while two entries match; entries that differ only in case are one", async () => {
    mount(["Apple", "Apricot", "apple"]);
    at(3);
    await type("Ap");
    expect(shown()).toEqual(["Ap", ""]);
    await type("p");
    // "Apple" and "apple" are one entry, the first seen.
    expect(shown()).toEqual(["Apple", "le"]);
    key("Escape");
    await type("Apr");
    expect(shown()).toEqual(["Apricot", "icot"]);
  });

  it("does not complete numbers or formulas, but completes text that starts with digits", async () => {
    mount(["12 apples", 12_345, "=SUMMARY"]);
    at(3);
    await type("12");
    expect(shown()).toEqual(["12", ""]);
    key("Escape");
    await type("=SU");
    expect(editor().value).toBe("=SU");
    // The first Escape closes the function list; the second cancels the edit.
    key("Escape");
    key("Escape");
    // "12 a" is text, so it completes.
    await type("12 a");
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
