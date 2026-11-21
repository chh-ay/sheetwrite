import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { expectSame } from "../../../test/expect-same.js";
import { numberFormatCode, numberFormatLabel, numberFormatParts } from "../src/format-presets.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellStyle, Renderer } from "../src/types.js";
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
async function openFormatCells(): Promise<HTMLDialogElement> {
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
  return elementAdded(host, ".sheetwrite-dialog", HTMLDialogElement);
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
    expectSame(document.activeElement, tabs[0]!);
    tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expectSame(document.activeElement, tabs[1]!);
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    const panels = [...dialog.querySelectorAll<HTMLElement>("[role=tabpanel]")];
    expect(panels.map((panel) => panel.hidden)).toEqual([true, false, true, true, true]);
    tabs[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expectSame(document.activeElement, tabs[4]!);

    await answerDialog(host, "Cancel");
    expectSame(document.activeElement, host);
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

  it("shows a custom code's sample in its section's color, and keeps OK from closing while the code is empty", async () => {
    const dialog = await openFormatCells();
    setValue(control(dialog, "Category", HTMLSelectElement), "Custom");
    const code = [...dialog.querySelectorAll<HTMLInputElement>("input[type=text]")][0]!;
    const type = (text: string) => {
      code.value = text;
      code.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const sample = control(dialog, "Sample", HTMLOutputElement);
    // Excel's Sample shows the number in its format section's color.
    type("[Red]0.0");
    expect([sample.textContent, sample.style.color]).toEqual(["0.5", "#ff0000"]);
    type("0.0");
    expect([sample.textContent, sample.style.color]).toEqual(["0.5", ""]);
    type("");
    dialog.querySelector<HTMLButtonElement>(".sheetwrite-dialog-default")!.click();
    expect(dialog.isConnected).toBe(true);
    expectSame(document.activeElement, code);
    type('0.0 "kg"');
    await answerDialog(host, "OK");
    expect(cell(0, 1).style.numberFormat).toBe('0.0 "kg"');
  });

  it("offers Excel's Fraction types and the Text category", async () => {
    let dialog = await openFormatCells();
    setValue(control(dialog, "Category", HTMLSelectElement), "Fraction");
    const type = [...dialog.querySelectorAll("select")].find((select) =>
      [...select.options].some((option) => option.value === "# ?/4"),
    )!;
    expect(type.closest("label")!.hidden).toBe(false);
    expect([...type.options].map((option) => option.textContent)).toContain("As quarters (2/4)");
    setValue(type, "# ?/4");
    expect(control(dialog, "Sample", HTMLOutputElement).textContent).toBe(" 2/4");
    await answerDialog(host, "OK");
    expect(cell(0, 1).style.numberFormat).toBe("# ?/4");

    dialog = await openFormatCells();
    expect(control(dialog, "Category", HTMLSelectElement).value).toBe("Fraction");
    setValue(control(dialog, "Category", HTMLSelectElement), "Text");
    expect(control(dialog, "Sample", HTMLOutputElement).textContent).toBe("0.5");
    await answerDialog(host, "OK");
    expect(cell(1, 1).style.numberFormat).toBe("@");
  });

  it("previews a change on the selected cells while it is open, and Cancel puts them back", async () => {
    // The style the grid paints for B1 in each frame.
    const painted: Array<CellStyle | undefined> = [];
    const recorder: Renderer = {
      mount() {},
      setLayout() {},
      setViewport() {},
      paint(view) {
        const index = (0 - view.rows.start) * view.cols.length + view.cols.indexOf(1);
        painted.push(view.styles[view.styleIds[index] ?? 0]);
      },
      setTheme() {},
      setRenderers() {},
      destroy() {},
    };
    expect(Reflect.set(grid, "renderer", recorder)).toBe(true);
    let changes = 0;
    grid.on("change", () => changes++);

    const dialog = await openFormatCells();
    const bold = control(dialog, "Bold", HTMLInputElement);
    bold.checked = true;
    bold.dispatchEvent(new Event("change", { bubbles: true }));
    grid.refresh();
    expect(painted.at(-1)?.bold).toBe(true);
    expect(cell(0, 1).style.bold).toBeUndefined();

    await answerDialog(host, "Cancel");
    grid.refresh();
    expect(painted.at(-1)?.bold).toBeUndefined();
    expect(changes).toBe(0);
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
      [{ ...base, category: "Fraction", code: "# ??/16" }, "# ??/16"],
      [{ ...base, category: "Text", code: "@" }, "@"],
    ] as const;
    for (const [parts, code] of cases) {
      expect(numberFormatCode(parts)).toBe(code);
      expect(numberFormatParts(code)).toEqual(parts);
    }
    expect(numberFormatParts(undefined).category).toBe("General");
    expect(numberFormatParts('0.0 "kg"').category).toBe("Custom");
  });

  it("name the Number Format box for the number-format keys and the % and comma buttons, as Excel does", () => {
    const cases: [string, string][] = [
      ["$#,##0.00_);($#,##0.00)", "Currency"],
      ["0%", "Percentage"],
      ["#,##0.00", "Number"],
      ["d-mmm-yy", "Date"],
      ["h:mm AM/PM", "Time"],
      ["0.00E+00", "Scientific"],
      ["General", "General"],
      ["m/d/yyyy", "Short Date"],
      ['0.0 "kg"', "Custom"],
    ];
    for (const [code, label] of cases) expect(numberFormatLabel(code), code).toBe(label);
  });
});
