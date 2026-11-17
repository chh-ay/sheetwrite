import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

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

function mount(): { grid: GridImpl; host: HTMLElement; store: SheetwriteStore } {
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
            rowCount: ROWS.length,
            colCount: 2,
            cells: ROWS.flatMap((row, rowOffset) =>
              row.map((value, colOffset) => ({
                rowOffset,
                colOffset,
                value: { kind: "literal" as const, value },
              })),
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
});
