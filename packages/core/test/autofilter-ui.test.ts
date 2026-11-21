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

/** The grid imports the AutoFilter dropdown lazily; awaiting the same module runs its callback first. */
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

/**
 * A browser clipboard whose rich format carries a cut's token, as a browser's
 * does. Returns a reader of its plain text.
 */
function stubClipboard(): () => Promise<string | undefined> {
  class ClipItem {
    readonly types: string[];
    constructor(private readonly entries: Record<string, Blob>) {
      this.types = Object.keys(entries);
    }
    getType(type: string): Promise<Blob> {
      const blob = this.entries[type];
      return blob ? Promise.resolve(blob) : Promise.reject(new Error(`No ${type}`));
    }
  }
  let items: ClipItem[] = [];
  Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: ClipItem });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: (written: ClipItem[]) => {
        items = written;
        return Promise.resolve();
      },
      read: () => Promise.resolve(items),
    },
  });
  return async () => (await items[0]?.getType("text/plain"))?.text();
}

describe("AutoFilter in the grid", () => {
  it("turns on for the current region with Ctrl+Shift+L and off again", () => {
    const { grid, host } = mount();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 1 } });
    press(host, "L", { ctrlKey: true, shiftKey: true });
    expect(grid.getAutoFilter()?.range).toEqual({
      sheet: "s1",
      start: { row: 0, col: 0 },
      end: { row: 3, col: 1 },
    });
    expect(grid.getCommandState("filter").activity).toBe("active");

    press(host, "L", { ctrlKey: true, shiftKey: true });
    expect(grid.getAutoFilter()).toBeNull();
  });

  it("opens a header's dropdown with Alt+Down and keeps the header selected after filtering", async () => {
    const { grid, host, store } = mount();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });
    grid.actions.toggleAutoFilter();
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

  it("filters by the selected cell's value, turning the AutoFilter on", () => {
    const { grid } = mount();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 3, col: 0 } });
    grid.actions.filterBySelection();
    expect(grid.getAutoFilter()?.range.start).toEqual({ row: 0, col: 0 });
    expect(grid.getColumnFilters().get(0)).toEqual({ kind: "values", values: ["fig"] });
    grid.undo();
    expect(grid.getAutoFilter()).toBeNull();
  });

  it("opens the dropdown for Alt+Down pressed right after Ctrl+Shift+L and ArrowUp", async () => {
    const { grid, host } = mount();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 1 } });
    // Ctrl+Shift+L acts at once and ArrowUp reaches B1; Alt+Down loads the dropdown.
    press(host, "L", { ctrlKey: true, shiftKey: true });
    press(host, "ArrowUp");
    press(host, "ArrowDown", { altKey: true });

    // Alt+Down on B1 opens the Qty header's dropdown.
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
        [...list.querySelectorAll(".sheetwrite-autofilter-label")].map(
          (label) => label.textContent,
        );
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

  it("cuts a filtered range as Excel does: the rows the filter hides move too", async () => {
    stubClipboard();
    const { grid, store } = mount();
    grid.setAutoFilter({ sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } });
    grid.setColumnFilter(0, { kind: "values", values: ["apple", "fig"] });
    // A2:A4 shows apple and fig; banana, between them, is hidden.
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 2, col: 0 } },
    });
    expect(await grid.actions.cut()).toBe("done");
    // Excel moves the hidden rows silently; the grid says so (#843).
    const notice = () => document.querySelector<HTMLElement>(".sheetwrite-action-status");
    expect(notice()?.textContent).toBe("This cut includes 1 hidden row. Show them");
    // Paste on A7: view row 5 is sheet row 7 below the filtered range.
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 5, col: 0 } });
    expect(await grid.actions.paste()).toBe("done");
    const item = (row: number) => store.getCell({ sheet: "s1", row, col: 0 }).resolved;
    expect([1, 2, 3, 6, 7, 8].map(item)).toEqual([null, null, null, "apple", "banana", "fig"]);
    expect(notice()?.textContent).toBe("This paste moved 1 hidden row. Show them");

    // Pasted in the filtered list, the cut lands on the sheet rows from B2
    // down, the hidden B3 included, as in Excel.
    grid.undo();
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 2, col: 0 } },
    });
    expect(await grid.actions.cut()).toBe("done");
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 1 } });
    expect(await grid.actions.paste()).toBe("done");
    const qty = (row: number) => store.getCell({ sheet: "s1", row, col: 1 }).resolved;
    expect([1, 2, 3].map(qty)).toEqual(["apple", "banana", "fig"]);

    notice()?.querySelector("button")?.click();
    await loaded();
    expect(grid.getColumnFilters().size).toBe(0);
    expect(notice()?.hidden).toBe(true);
  });

  it("shows the rows Hide Rows hid, from the cut notice's Show them", async () => {
    stubClipboard();
    const { grid } = mount();
    // Sheet row 2 (banana) is hidden; view rows 1 and 2 show apple and fig.
    grid.hideRows([2]);
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 2, col: 0 } },
    });
    expect(await grid.actions.cut()).toBe("done");
    const notice = document.querySelector<HTMLElement>(".sheetwrite-action-status");
    expect(notice?.textContent).toBe("This cut includes 1 hidden row. Show them");
    notice?.querySelector("button")?.click();
    expect(grid.hiddenRows()).toEqual([]);
    grid.undo();
    expect(grid.hiddenRows()).toEqual([2]);
  });

  it("copies and cuts the active cell of a hidden row, as Excel does", async () => {
    const clipboardText = stubClipboard();
    const { grid, store } = mount();
    grid.setAutoFilter({ sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } });
    grid.setColumnFilter(0, { kind: "values", values: ["apple", "fig"] });
    // A3, banana, is on a row the filter hides; the Name Box goes there.
    const banana = { sheet: "s1", row: 2, col: 0 };
    expect(grid.goToCell(banana)).toBe(true);
    expect(await grid.actions.copy()).toBe("done");
    expect(await clipboardText()).toBe("banana");

    expect(await grid.actions.cut()).toBe("done");
    // Paste on A7: view row 5 shows sheet row 6, below the filtered range.
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 5, col: 0 } });
    expect(await grid.actions.paste()).toBe("done");
    expect(store.getCell(banana).resolved).toBeNull();
    expect(store.getCell({ sheet: "s1", row: 6, col: 0 }).resolved).toBe("banana");
  });

  it("reports the sheet address of edited and selected cells under a filter", () => {
    const { grid } = mount();
    grid.setAutoFilter({ sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } });
    grid.setColumnFilter(0, { kind: "values", values: ["apple", "fig"] });
    const begins: unknown[] = [];
    const focuses: unknown[] = [];
    grid.on("edit-begin", ({ addr, sheetAddress }) => begins.push([addr.row, sheetAddress.row]));
    grid.on("selection", ({ sheetFocus }) => focuses.push(sheetFocus?.row));
    // View row 2 shows fig, on sheet row 3.
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 0 } });
    grid.beginEdit(2, 0);
    expect(focuses).toEqual([3]);
    expect(begins).toEqual([[2, 3]]);
  });

  it("maps view rows to sheet rows and back under a filter", () => {
    const { grid } = mount();
    grid.setAutoFilter({ sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } });
    grid.setColumnFilter(0, { kind: "values", values: ["apple", "fig"] });
    // The view shows the header, apple (sheet row 1), fig (3), then sheet rows 4 to 9.
    expect([0, 1, 2, 3, 8, 9].map((row) => grid.sheetRowOf(row))).toEqual([0, 1, 3, 4, 9, null]);
    expect([0, 1, 2, 3, 9, 10].map((row) => grid.viewRowOf(row))).toEqual([0, 1, null, 2, 8, null]);
  });
});
