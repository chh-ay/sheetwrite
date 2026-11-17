import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { type GridImpl, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DataValidationRule } from "../src/types.js";
import { answerDialog, elementAdded, mountGridWithData } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
  document.body.replaceChildren();
});

const amount = { sheet: "s1", row: 0, col: 1 };

function amountRule(fields: Partial<DataValidationRule> = {}): DataValidationRule {
  return {
    id: "amount",
    range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 9, col: 1 } },
    condition: { kind: "number", integer: true, min: 1, max: 5 },
    policy: "reject",
    ...fields,
  };
}

function editorOf(host: HTMLElement): HTMLTextAreaElement {
  const editor = host.querySelector<HTMLTextAreaElement>("textarea.sheetwrite-editor");
  if (!editor) throw new Error("expected the cell editor");
  return editor;
}

function press(target: HTMLElement, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** Type `text` into B1 and press Enter, as a user does. */
function typeIntoAmount(host: HTMLElement, grid: GridImpl, text: string): void {
  grid.beginEdit(0, 1, text);
  press(editorOf(host), "Enter");
}

describe("data validation error alert", () => {
  it("shows Excel's Stop alert, and Retry returns to the entry", async () => {
    const { grid, host, store } = mountGridWithData(10);
    grid.setValidationRule(amountRule());

    typeIntoAmount(host, grid, "99");
    const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    expect(dialog.getAttribute("role")).toBe("alertdialog");
    expect(dialog.textContent).toContain("Data Validation");
    expect(dialog.textContent).toContain(
      "This value doesn't match the data validation restrictions defined for this cell.",
    );
    expect([...dialog.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Retry",
      "Cancel",
    ]);
    expect(store.getCell(amount).resolved).toBe(0.5);

    await answerDialog(host, "Retry");
    const editor = editorOf(host);
    expect(editor.value).toBe("99");
    expect(document.activeElement).toBe(editor);
    expect(store.getCell(amount).resolved).toBe(0.5);
    grid.destroy();
    store.dispose();
  });

  it("drops the entry on Cancel and shows the rule's own title and message", async () => {
    const { grid, host, store } = mountGridWithData(10);
    grid.setValidationRule(amountRule({ errorTitle: "Quantity", helpText: "Enter 1 to 5." }));

    typeIntoAmount(host, grid, "99");
    const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    expect(dialog.querySelector(".sheetwrite-dialog-title")?.textContent).toBe("Quantity");
    expect(dialog.textContent).toContain("Enter 1 to 5.");
    await answerDialog(host, "Cancel");
    expect(document.activeElement).toBe(host);
    expect(store.getCell(amount).resolved).toBe(0.5);
    grid.destroy();
    store.dispose();
  });

  it("keeps the value on a Warning's Yes and returns to the entry on No", async () => {
    const { grid, host, store } = mountGridWithData(10);
    grid.setValidationRule(amountRule({ policy: "warn" }));

    typeIntoAmount(host, grid, "99");
    const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    expect(dialog.textContent).toContain("Continue?");
    expect(dialog.querySelector(".sheetwrite-dialog-default")?.textContent).toBe("No");
    await answerDialog(host, "No");
    expect(editorOf(host).value).toBe("99");
    expect(store.getCell(amount).resolved).toBe(0.5);

    press(editorOf(host), "Escape");
    typeIntoAmount(host, grid, "99");
    await answerDialog(host, "Yes");
    expect(store.getCell(amount).resolved).toBe(99);
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s1", row: 1, col: 1 } });
    grid.destroy();
    store.dispose();
  });

  it("keeps the value on an Information alert's OK", async () => {
    const { grid, host, store } = mountGridWithData(10);
    grid.setValidationRule(amountRule({ policy: "warn", errorStyle: "information" }));

    typeIntoAmount(host, grid, "99");
    const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    expect([...dialog.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "OK",
      "Cancel",
    ]);
    await answerDialog(host, "OK");
    expect(store.getCell(amount).resolved).toBe(99);
    grid.destroy();
    store.dispose();
  });

  it("checks a formula by its result", async () => {
    const { grid, host, store } = mountGridWithData(10);
    grid.setValidationRule(amountRule());

    typeIntoAmount(host, grid, "=2+1");
    expect(host.querySelector(".sheetwrite-dialog")).toBeNull();
    expect(store.getCell(amount).resolved).toBe(3);

    typeIntoAmount(host, grid, "=2*50");
    await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    expect(store.getCell(amount).resolved).toBe(3);
    grid.destroy();
    store.dispose();
  });
});
