import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { dateToSerial } from "../src/date-serial.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellScalar, WorkbookSnapshot } from "../src/types.js";

const ACTIONS_MODULE = "../src/autofilter-actions.js";
let restoreStubs: () => void;
const disposers: (() => void)[] = [];

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose();
  restoreStubs();
  document.body.replaceChildren();
});

const ROWS: (readonly CellScalar[])[] = [
  ["Item", "Qty"],
  ["apple", 3],
  ["banana", 12],
  ["fig", 7],
];

/**
 * A grid of `rows` on sheet s1. `formats` gives the number format of each
 * column's cells below the header, on the cells, as XLSX import puts it.
 */
function mount(
  rows: readonly (readonly CellScalar[])[] = ROWS,
  formats: readonly (string | undefined)[] = [],
): { grid: GridImpl; host: HTMLElement; store: SheetwriteStore } {
  const snapshot: WorkbookSnapshot = {
    schemaVersion: 1,
    workbook: { activeSheet: "s1" },
    sheets: [
      {
        id: "s1",
        name: "Orders",
        order: 0,
        rowCount: 10,
        columns: [
          { key: "item", header: "A", width: 100, type: "text" },
          { key: "qty", header: "B", width: 100, type: "number" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: rows.length,
            colCount: 2,
            cells: rows.flatMap((row, rowOffset) =>
              row.map((value, colOffset) => {
                const numberFormat = rowOffset > 0 ? formats[colOffset] : undefined;
                return {
                  rowOffset,
                  colOffset,
                  value: { kind: "literal" as const, value },
                  ...(numberFormat ? { style: { numberFormat } } : {}),
                };
              }),
            ),
          },
        ],
      },
    ],
  };
  const store = SheetwriteStore.fromSnapshot(snapshot);
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 640, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 320, configurable: true });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook: store.getWorkbook() }, store);
  disposers.push(
    () => store.dispose(),
    () => grid.destroy(),
  );
  return { grid, host, store };
}

const press = (target: HTMLElement, key: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );

/** The grid imports the AutoFilter commands lazily; awaiting the same module runs its callback first. */
async function loaded(): Promise<void> {
  await import(ACTIONS_MODULE);
  await Promise.resolve();
}

async function dropdown(): Promise<HTMLElement> {
  await loaded();
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error("the dropdown did not open");
  return dialog;
}

describe("AutoFilter in the grid", () => {
  it("turns on for the current region with Ctrl+Shift+L and off again", async () => {
    const { grid, host } = mount();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 1 } });
    press(host, "L", { ctrlKey: true, shiftKey: true });
    await loaded();
    expect(grid.getAutoFilter()?.range).toEqual({
      sheet: "s1",
      start: { row: 0, col: 0 },
      end: { row: 3, col: 1 },
    });
    expect(grid.getCommandState("filter").activity).toBe("active");

    press(host, "L", { ctrlKey: true, shiftKey: true });
    await loaded();
    expect(grid.getAutoFilter()).toBeNull();
  });

  it("opens a header's dropdown with Alt+Down and keeps the header selected after filtering", async () => {
    const { grid, host, store } = mount();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });
    grid.actions.toggleAutoFilter();
    await loaded();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    press(host, "ArrowDown", { altKey: true });

    const dialog = await dropdown();
    expect(dialog.getAttribute("aria-label")).toBe("Filter Item");
    const list = dialog.querySelector<HTMLElement>('[role="listbox"]');
    if (!list) throw new Error("no value list");
    list.focus();
    press(list, "ArrowDown");
    press(list, " ");
    press(list, "Enter");

    expect(grid.getColumnFilters().get(0)).toEqual({ kind: "values", values: ["banana", "fig"] });
    expect(store.viewRowCount("s1")).toBe(9);
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    expect(document.activeElement).toBe(host);
  });

  it("filters by the selected cell's value, turning the AutoFilter on", async () => {
    const { grid } = mount();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 3, col: 0 } });
    grid.actions.filterBySelection();
    await loaded();
    expect(grid.getAutoFilter()?.range.start).toEqual({ row: 0, col: 0 });
    expect(grid.getColumnFilters().get(0)).toEqual({ kind: "values", values: ["fig"] });
    grid.undo();
    expect(grid.getAutoFilter()).toBeNull();
  });

  it("acts on keys pressed while its code loads, after the command, in order", async () => {
    const { grid, host } = mount();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 1 } });
    // All three keys arrive before the AutoFilter's chunk has loaded; ArrowUp reaches B1.
    press(host, "L", { ctrlKey: true, shiftKey: true });
    press(host, "ArrowUp");
    press(host, "ArrowDown", { altKey: true });

    // Ctrl+Shift+L acts first, so Alt+Down on B1 opens the Qty header's dropdown.
    for (let tick = 0; tick < 10 && !document.querySelector('[role="dialog"]'); tick++) {
      await loaded();
    }
    expect(grid.getAutoFilter()?.range.start).toEqual({ row: 0, col: 0 });
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s1", row: 0, col: 1 } });
    const dialog = await dropdown();
    expect(dialog.getAttribute("aria-label")).toBe("Filter Qty");
  });

  it("lists a date column by year, month and day with Date Filters, and prices as their cells show", async () => {
    // 2 January 2026, 2 February 2026 and 1 January 2025, in the cells' own formats.
    const rows = [
      ["Date", "Price"],
      [46024, 39.5],
      [46055, 64.25],
      [45658, 39.5],
    ];
    const { grid, host, store } = mount(rows, ["m/d/yyyy", "$#,##0.00"]);
    grid.setAutoFilter({ sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } });
    const open = async (col: number) => {
      grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col } });
      press(host, "ArrowDown", { altKey: true });
      const dialog = await dropdown();
      const list = dialog.querySelector<HTMLElement>(".sheetwrite-autofilter-list");
      if (!list) throw new Error("no value list");
      const labels = () =>
        [...list.querySelectorAll(".sheetwrite-autofilter-option")].map((row) => row.textContent);
      return { dialog, list, labels };
    };

    const dates = await open(0);
    expect(dates.list.getAttribute("role")).toBe("tree");
    expect(
      [...dates.dialog.querySelectorAll("button")].map((button) => button.textContent),
    ).toContain("Date Filters");
    expect(dates.labels()).toEqual(["(Select All)", "2025", "2026"]);
    dates.list.focus();
    press(dates.list, "End");
    press(dates.list, "ArrowRight");
    press(dates.list, "End");
    press(dates.list, "ArrowRight");
    expect(dates.labels()).toEqual(["(Select All)", "2025", "2026", "January", "February", "02"]);
    // Untick 2025: the 2026 rows stay.
    press(dates.list, "Home");
    press(dates.list, "ArrowDown");
    press(dates.list, " ");
    press(dates.list, "Enter");
    expect(grid.getColumnFilters().get(0)).toEqual({ kind: "values", values: [46024, 46055] });
    expect(store.viewRowCount("s1")).toBe(9);

    const prices = await open(1);
    expect(prices.labels()).toEqual(["(Select All)", "$39.50", "$64.25"]);
    press(prices.list, "Escape");

    // All Dates in the Period › February keeps the February date of any year.
    grid.setColumnFilter(0, { kind: "dynamic", type: "M2" });
    expect(store.viewRowCount("s1")).toBe(8);
    // Today keeps the dates of the computer's calendar day.
    const now = new Date();
    const today = dateToSerial(
      new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
    );
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 0 },
          value: { kind: "literal", value: today + 0.5 },
        },
      ],
    });
    grid.setColumnFilter(0, { kind: "dynamic", type: "today" });
    expect(store.viewRowCount("s1")).toBe(8);
  });
});
