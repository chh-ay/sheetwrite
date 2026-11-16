import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellValue, Grid, Sheet, SheetId, Workbook } from "../src/types.js";
import { mountHost, sheet } from "./fixtures.js";

// Excel's sheet commands: Insert, Tab Color, Move or Copy, and the keys that
// switch sheets.
// https://support.microsoft.com/en-us/excel/get-started/insert-or-delete-a-worksheet
// https://support.microsoft.com/en-us/excel/add-a-background-color-to-a-sheet-tab
// https://support.microsoft.com/en-us/office/move-or-copy-worksheets-or-worksheet-data-47207967-bbb2-4e95-9b5c-3c174aa69328

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;
let store: SheetwriteStore;
let grid: Grid;
let host: HTMLDivElement;

function named(id: SheetId, name: string): Sheet {
  return { ...sheet(id), name };
}

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
  const workbook: Workbook = {
    activeSheet: "a",
    sheets: [
      named("a", "Sales"),
      named("b", "Costs"),
      { ...named("c", "Old"), visibility: "hidden" },
      named("d", "Notes"),
    ],
  };
  store = new SheetwriteStore(workbook);
  host = mountHost();
  grid = new GridImpl(host, { workbook }, store);
});

afterEach(() => {
  grid.destroy();
  store.dispose();
  restoreStubs();
});

const names = (): string[] => store.getWorkbook().sheets.map((candidate) => candidate.name);
const sheetById = (id: SheetId): Sheet | undefined =>
  store.getWorkbook().sheets.find((candidate) => candidate.id === id);

function press(key: string, init: KeyboardEventInit): void {
  host.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );
}

function set(sheetId: SheetId, row: number, value: CellValue): void {
  store.applyTransaction({
    patches: [{ op: "set", addr: { sheet: sheetId, row, col: 0 }, value }],
  });
}

describe("switching sheets from the keyboard", () => {
  it("moves to the next or previous visible sheet with Ctrl+PageDown and Ctrl+PageUp, or with Ctrl+Alt as in Excel for the web", () => {
    press("PageDown", { ctrlKey: true });
    expect(grid.getActiveSheet()).toBe("b");
    // The hidden sheet is skipped.
    press("PageDown", { ctrlKey: true, altKey: true });
    expect(grid.getActiveSheet()).toBe("d");
    // The last sheet stays active.
    press("PageDown", { ctrlKey: true });
    expect(grid.getActiveSheet()).toBe("d");
    press("PageUp", { ctrlKey: true, altKey: true });
    expect(grid.getActiveSheet()).toBe("b");
    press("PageUp", { ctrlKey: true });
    expect(grid.getActiveSheet()).toBe("a");
  });
});

describe("Insert", () => {
  it("adds a sheet at a tab position", () => {
    expect(grid.addSheet({ name: "Q3", index: 1 }).status).toBe("applied");
    expect(names()).toEqual(["Sales", "Q3", "Costs", "Old", "Notes"]);
  });
});

describe("Tab Color", () => {
  it("colors a tab as one undo step and keeps the color in a snapshot", () => {
    expect(grid.setSheetTabColor("b", "#C00000").status).toBe("applied");
    expect(sheetById("b")?.tabColor).toBe("#C00000");
    const saved = store.exportSnapshot();
    expect(saved.sheets.find((candidate) => candidate.id === "b")?.tabColor).toBe("#C00000");
    const reloaded = SheetwriteStore.fromSnapshot(saved);
    expect(reloaded.getWorkbook().sheets.find((candidate) => candidate.id === "b")?.tabColor).toBe(
      "#C00000",
    );
    reloaded.dispose();

    grid.undo();
    expect(sheetById("b")?.tabColor).toBeUndefined();
    expect(grid.setSheetTabColor("b", "red").status).toBe("rejected");
  });
});

describe("Move or Copy", () => {
  it("copies a sheet before another and points the copy's own references at the copy", () => {
    set("a", 0, { kind: "literal", value: 5 });
    set("a", 1, { kind: "formula", src: "=Sales!A1*2" });
    set("a", 2, { kind: "formula", src: "=Costs!A1+A1" });

    const result = grid.copySheet("a", { index: 2 });
    expect(result.status).toBe("applied");
    expect(names()).toEqual(["Sales", "Costs", "Sales (2)", "Old", "Notes"]);
    const copy = result.sheet;
    expect(store.getFormula({ sheet: copy, row: 1, col: 0 })).toBe("='Sales (2)'!A1*2");
    expect(store.getFormula({ sheet: copy, row: 2, col: 0 })).toBe("=Costs!A1+A1");

    set(copy, 0, { kind: "literal", value: 7 });
    expect(store.getCell({ sheet: copy, row: 1, col: 0 }).resolved).toBe(14);
    expect(store.getCell({ sheet: "a", row: 1, col: 0 }).resolved).toBe(10);

    expect(grid.copySheet("a").status).toBe("applied");
    expect(names()).toContain("Sales (3)");
  });

  it("removes the copy on undo", () => {
    grid.copySheet("b");
    expect(names()).toEqual(["Sales", "Costs", "Costs (2)", "Old", "Notes"]);
    grid.undo();
    expect(names()).toEqual(["Sales", "Costs", "Old", "Notes"]);
  });
});
