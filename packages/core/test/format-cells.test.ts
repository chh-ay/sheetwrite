import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { numberFormatCode, numberFormatParts } from "../src/format-cells.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import {
  answerDialog,
  elementAdded,
  makeColumnarData,
  makeWorkbook,
  mountHost,
} from "./fixtures.js";

// Excel's Format Cells dialog (Ctrl+1):
// https://support.microsoft.com/en-us/office/available-number-formats-in-excel-0afe8f52-97db-41f1-b972-4b46e9f1e8d2

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;
let grid: GridImpl;
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

const cell = (row: number, col: number) => store.getCell({ sheet: "s1", row, col });

/** Ctrl+1 on the grid over B1:B2, then the open dialog. */
async function openFormatCells(): Promise<HTMLDivElement> {
  grid.setSelection({
    kind: "range",
    range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 1, col: 1 } },
  });
  const event = new KeyboardEvent("keydown", {
    key: "1",
    code: "Digit1",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  host.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  return elementAdded(host, ".sheetwrite-dialog", HTMLDivElement);
}

function control<T extends HTMLElement>(dialog: HTMLElement, label: string, type: new () => T): T {
  for (const wrapper of dialog.querySelectorAll("label")) {
    if (wrapper.firstChild?.textContent !== label && wrapper.textContent !== label) continue;
    const found = wrapper.querySelector("input, select, output");
    if (found instanceof type) return found;
  }
  throw new Error(`no ${label} control`);
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Format Cells", () => {
  it("opens with Ctrl+1 as a labelled dialog with Excel's five tabs", async () => {
    const dialog = await openFormatCells();
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
      "Format Cells",
    );
    const tabs = [...dialog.querySelectorAll<HTMLElement>("[role=tab]")];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Number",
      "Alignment",
      "Font",
      "Border",
      "Fill",
    ]);
    expect(document.activeElement).toBe(tabs[0]!);
    tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(tabs[1]!);
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    const panels = [...dialog.querySelectorAll<HTMLElement>("[role=tabpanel]")];
    expect(panels.map((panel) => panel.hidden)).toEqual([true, false, true, true, true]);
    tabs[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement).toBe(tabs[4]!);

    await answerDialog(host, "Cancel");
    expect(document.activeElement).toBe(host);
    expect(cell(0, 1).style).toEqual({});
  });

  it("applies the number, alignment, font, border and fill changes as one undo step", async () => {
    const dialog = await openFormatCells();
    setValue(control(dialog, "Category", HTMLSelectElement), "Percentage");
    setValue(control(dialog, "Decimal places", HTMLInputElement), "1");
    expect(control(dialog, "Sample", HTMLOutputElement).textContent).toBe("50.0%");
    setValue(control(dialog, "Horizontal", HTMLSelectElement), "center");
    const bold = control(dialog, "Bold", HTMLInputElement);
    bold.checked = true;
    const outline = [...dialog.querySelectorAll<HTMLInputElement>("input[type=radio]")].find(
      (radio) => radio.value === "outside",
    )!;
    outline.checked = true;
    const fill = dialog.querySelector<HTMLInputElement>("input[aria-label='Background color']")!;
    fill.value = "#ffcc00";
    fill.dispatchEvent(new Event("input", { bubbles: true }));
    await answerDialog(host, "OK");

    expect(cell(1, 1).style).toMatchObject({
      numberFormat: "0.0%",
      align: "center",
      bold: true,
      backgroundColor: "#ffcc00",
    });
    expect(cell(0, 1).style.border?.top).toMatchObject({ style: "solid" });
    expect(cell(1, 1).style.border?.bottom).toMatchObject({ style: "solid" });
    expect(cell(1, 1).style.italic).toBeUndefined();

    grid.actions.undo();
    expect(cell(0, 1).style).toEqual({});
    expect(cell(1, 1).style).toEqual({});
  });

  it("keeps OK from closing while a custom code is empty", async () => {
    const dialog = await openFormatCells();
    setValue(control(dialog, "Category", HTMLSelectElement), "Custom");
    const code = [...dialog.querySelectorAll<HTMLInputElement>("input[type=text]")][0]!;
    code.value = "";
    code.dispatchEvent(new Event("input", { bubbles: true }));
    dialog.querySelector<HTMLButtonElement>(".sheetwrite-dialog-default")!.click();
    expect(dialog.isConnected).toBe(true);
    expect(document.activeElement).toBe(code);
    code.value = '0.0 "kg"';
    code.dispatchEvent(new Event("input", { bubbles: true }));
    await answerDialog(host, "OK");
    expect(cell(0, 1).style.numberFormat).toBe('0.0 "kg"');
  });
});

describe("Number tab categories", () => {
  it("make Excel's codes and read them back", () => {
    const base = { decimals: 2, thousands: false, parentheses: false, code: "" };
    const cases = [
      [{ ...base, category: "Number", thousands: true }, "#,##0.00"],
      [{ ...base, category: "Number", decimals: 0, parentheses: true }, "0_);(0)"],
      [{ ...base, category: "Currency", parentheses: true }, "$#,##0.00_);($#,##0.00)"],
      [{ ...base, category: "Percentage", decimals: 0 }, "0%"],
      [{ ...base, category: "Scientific" }, "0.00E+00"],
      [{ ...base, category: "Date", code: "d-mmm-yy" }, "d-mmm-yy"],
    ] as const;
    for (const [parts, code] of cases) {
      expect(numberFormatCode(parts)).toBe(code);
      expect(numberFormatParts(code)).toEqual(parts);
    }
    expect(numberFormatParts(undefined).category).toBe("General");
    expect(numberFormatParts('0.0 "kg"').category).toBe("Custom");
  });
});
