import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { expectSame } from "../../../test/expect-same.js";
import { type GridImpl, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { DataValidationRule } from "../src/types.js";
import { answerDialog, elementAdded, mountGridWithData } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restore_stubs: () => void;

beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
});

afterEach(() => {
  restore_stubs();
  document.body.replaceChildren();
});

const amount = { sheet: "s1", row: 0, col: 1 };

function amount_rule(fields: Partial<DataValidationRule> = {}): DataValidationRule {
  return {
    id: "amount",
    range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 9, col: 1 } },
    condition: { kind: "number", integer: true, min: 1, max: 5 },
    policy: "reject",
    ...fields,
  };
}

function editor_of(host: HTMLElement): HTMLTextAreaElement {
  const editor = host.querySelector<HTMLTextAreaElement>("textarea.sheetwrite-editor");
  if (!editor) throw new Error("expected the cell editor");
  return editor;
}

function press(target: HTMLElement, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** Type `text` into B1 and press Enter, as a user does. */
function type_into_amount(host: HTMLElement, grid: GridImpl, text: string): void {
  grid.beginEdit(0, 1, text);
  press(editor_of(host), "Enter");
}

describe("data validation error alert", () => {
  it("drops the entry on Cancel and shows the rule's own title and message", async () => {
    const { grid, host, store } = mountGridWithData(10);
    grid.setValidationRule(amount_rule({ errorTitle: "Quantity", helpText: "Enter 1 to 5." }));

    type_into_amount(host, grid, "99");
    const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    expect(dialog.querySelector(".sheetwrite-dialog-title")?.textContent).toBe("Quantity");
    expect(dialog.textContent).toContain("Enter 1 to 5.");
    await answerDialog(host, "Cancel");
    expectSame(document.activeElement, host);
    expect(store.getCell(amount).resolved).toBe(0.5);
    grid.destroy();
    store.dispose();
  });

  it("keeps the value on a Warning's Yes and returns to the entry on No", async () => {
    const { grid, host, store } = mountGridWithData(10);
    grid.setValidationRule(amount_rule({ policy: "warn" }));

    type_into_amount(host, grid, "99");
    const dialog = await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    expect(dialog.textContent).toContain("Continue?");
    expect(dialog.querySelector(".sheetwrite-dialog-default")?.textContent).toBe("No");
    await answerDialog(host, "No");
    expect(editor_of(host).value).toBe("99");
    expect(store.getCell(amount).resolved).toBe(0.5);

    press(editor_of(host), "Escape");
    type_into_amount(host, grid, "99");
    await answerDialog(host, "Yes");
    expect(store.getCell(amount).resolved).toBe(99);
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s1", row: 1, col: 1 } });
    grid.destroy();
    store.dispose();
  });

  it("keeps the value on an Information alert's OK", async () => {
    const { grid, host, store } = mountGridWithData(10);
    grid.setValidationRule(amount_rule({ policy: "warn", errorStyle: "information" }));

    type_into_amount(host, grid, "99");
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
    grid.setValidationRule(amount_rule());

    type_into_amount(host, grid, "=2+1");
    expect(host.querySelector(".sheetwrite-dialog")).toBeNull();
    expect(store.getCell(amount).resolved).toBe(3);

    type_into_amount(host, grid, "=2*50");
    await elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
    expect(store.getCell(amount).resolved).toBe(3);
    grid.destroy();
    store.dispose();
  });
});
