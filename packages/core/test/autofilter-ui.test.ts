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

  it("cuts a filtered range as Excel does: the rows the filter hides move too", async () => {
    // The clipboard's rich format carries the cut's token, as a browser's does.
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
    notice()?.querySelector("button")?.click();
    await loaded();
    expect(grid.getColumnFilters().size).toBe(0);
    expect(notice()?.hidden).toBe(true);
  });
});
