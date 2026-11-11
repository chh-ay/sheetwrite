import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import {
  createFormulaBar,
  createNameBox,
  createSpreadsheetShell,
  createToolbar,
} from "../src/shell.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid, Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
});
function makeGrid(rowCount = 20): { grid: Grid; store: SheetwriteStore; host: HTMLDivElement } {
  const workbook = makeWorkbook(rowCount);
  const store = new SheetwriteStore(workbook, makeColumnarData(rowCount));
  const host = mountHost();
  const grid = new GridImpl(host, { workbook }, store);
  return { grid, store, host };
}

function multiSheetWorkbook(): Workbook {
  const base = makeWorkbook(10);
  base.sheets.push({
    id: "s2",
    name: "Summary",
    rowCount: 5,
    columns: [{ key: "note", header: "Note", width: 200, type: "text" }],
  });
  return base;
}

describe("Grid.getCellInput / getActiveSheet / active-sheet event", () => {
  it("returns formula source, not the resolved value", () => {
    const { grid, store } = makeGrid();
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 1 },
          value: { kind: "formula", src: "=B2+1" },
        },
      ],
    });

    expect(grid.getCellInput(0, 1)!.text).toBe("=B2+1");

    grid.destroy();
    store.dispose();
  });
});

describe("createToolbar", () => {
  it("keeps one-click border, merge, unmerge and clear-format buttons in custom toolbars", async () => {
    const { grid, store, host } = makeGrid();
    const piece = createToolbar(host, grid, {
      items: [
        { action: "border" },
        { action: "merge" },
        { action: "unmerge" },
        { action: "clearFormat" },
      ],
    });
    const click = async (action: string): Promise<void> => {
      const button = piece.element.querySelector<HTMLButtonElement>(`[data-command="${action}"]`);
      if (button === null) throw new Error(`no ${action} button`);
      button.click();
      for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    };
    const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } };
    grid.setSelection({ kind: "range", range });
    grid.styleRange(range, { bold: true });

    await click("border");
    // The pre-0.7 one-click toggle: an all-sides border on every selected cell.
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).style.border?.all).toBeDefined();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).style.border?.all).toBeDefined();
    // A second click removes it again, so the item is a toggle, not a one-way setter.
    await click("border");
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).style.border?.all).toBeUndefined();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).style.border?.all).toBeUndefined();
    await click("merge");
    expect(grid.store.getWorkbook().sheets[0]?.merges ?? []).toHaveLength(1);
    await click("unmerge");
    expect(grid.store.getWorkbook().sheets[0]?.merges ?? []).toHaveLength(0);
    await click("clearFormat");
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).style.bold).not.toBe(true);

    piece.destroy();
    grid.destroy();
    store.dispose();
  });

  it("moves keyboard focus within toolbar bounds and ignores unrelated keys", () => {
    const { grid, store, host } = makeGrid();
    const piece = createToolbar(host, grid, {
      label: "Editing",
      items: [
        { onClick: () => {}, title: "One" },
        { onClick: () => {}, title: "Two" },
        { onClick: () => {}, title: "Three" },
      ],
    });
    try {
      const controls = [...piece.element.querySelectorAll<HTMLButtonElement>("button")];
      controls[1]!.focus();
      for (const [key, expected] of [
        ["ArrowLeft", 0],
        ["ArrowRight", 1],
        ["End", 2],
        ["ArrowRight", 2],
        ["Home", 0],
        ["ArrowLeft", 0],
      ] as const) {
        piece.element.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        );
        expect(document.activeElement, key).toBe(controls[expected]!);
      }
      piece.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(document.activeElement).toBe(controls[0]!);
      expect(piece.element.getAttribute("role")).toBe("toolbar");
      expect(piece.element.getAttribute("aria-label")).toBe("Editing");
    } finally {
      piece.destroy();
      grid.destroy();
      store.dispose();
    }
  });
});

describe("createNameBox", () => {
  it("follows the selection and jumps on Enter within bounds", () => {
    const { grid, store, host } = makeGrid();
    let focused = 0;
    const piece = createNameBox(host, grid, { focusGrid: () => focused++ });
    const input = piece.element;
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) throw new Error("name box must be an input");

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 4, col: 2 } });
    expect(input.value).toBe("C5");

    // Several ranges show the cell of the last one, where Excel keeps the active cell.
    grid.setSelection({
      kind: "multi",
      ranges: [
        { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
        { sheet: "s1", start: { row: 3, col: 3 }, end: { row: 4, col: 4 } },
      ],
    });
    expect(input.value).toBe("D4");

    input.value = "b3";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s1", row: 2, col: 1 } });
    expect(focused).toBe(1);

    // Ranges select like Excel's name box; $ anchors are ignored.
    input.value = "a2:$C$4";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(grid.getSelection()).toEqual({
      kind: "range",
      range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 3, col: 2 } },
    });

    piece.destroy();
    grid.destroy();
    store.dispose();
  });

  it("marks invalid or out-of-bounds references without touching the grid", () => {
    const { grid, store, host } = makeGrid();
    const piece = createNameBox(host, grid, {});
    const input = piece.element;
    if (!(input instanceof HTMLInputElement)) throw new Error("name box must be an input");

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    const before = grid.getSelection();

    for (const bad of ["", "5B", "A0", "ZZ9", "A999", "A1:", "A1:A999"]) {
      input.value = bad;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(grid.getSelection()).toEqual(before);
    }

    piece.destroy();
    grid.destroy();
    store.dispose();
  });
});

describe("createFormulaBar", () => {
  it("commits through the undoable grid path at the captured data address", () => {
    const { grid, store, host } = makeGrid();
    const piece = createFormulaBar(host, grid, {});
    const input = piece.element;
    if (!(input instanceof HTMLInputElement)) throw new Error("formula bar must be an input");

    // Descending sort: view row 0 = data row 19.
    grid.setViewSort([{ col: 1, ascending: false }]);
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    expect(input.value).toBe("Customer 19");

    input.value = "edited-via-bar";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));

    const dataAddr = { sheet: "s1", row: 19, col: 0 };
    expect(store.getCell(dataAddr).resolved).toBe("edited-via-bar");
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Customer 0");

    grid.undo();
    expect(store.getCell(dataAddr).resolved).toBe("Customer 19");

    piece.destroy();
    grid.destroy();
    store.dispose();
  });

  it("never overwrites a focused dirty draft and restores on Escape", () => {
    const { grid, store, host } = makeGrid();
    const piece = createFormulaBar(host, grid, {});
    const input = piece.element;
    if (!(input instanceof HTMLInputElement)) throw new Error("formula bar must be an input");

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });
    const stable = input.value;

    input.focus();
    input.value = "draft-in-progress";
    input.dispatchEvent(new InputEvent("input", { inputType: "insertFromPaste" }));

    // A concurrent change event must not clobber the draft.
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 9, col: 0 },
          value: { kind: "literal", value: "z" },
        },
      ],
    });
    expect(input.value).toBe("draft-in-progress");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    expect(input.value).toBe(stable);

    piece.destroy();
    grid.destroy();
    store.dispose();
  });

  it("blocks commits in read-only mode", () => {
    const { grid, store, host } = makeGrid();
    const piece = createFormulaBar(host, grid, {});
    const input = piece.element;
    if (!(input instanceof HTMLInputElement)) throw new Error("formula bar must be an input");

    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });
    piece.setReadOnly(true);
    expect(input.readOnly).toBe(true);

    input.value = "should-not-land";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("Customer 1");

    piece.destroy();
    grid.destroy();
    store.dispose();
  });
});

describe("createSpreadsheetShell", () => {
  it("composes one grid with shell chrome and no duplicate built-ins", async () => {
    const host = mountHost();
    const workbook = multiSheetWorkbook();
    const ready: Grid[] = [];

    const shell = createSpreadsheetShell(host, {
      grid: { workbook, data: makeColumnarData(10), config: { toolbar: true, tabs: true } },
      onReady: (grid) => ready.push(grid),
    });

    expect(ready).toEqual([shell.grid]);
    // The shell toolbar loads lazily: wait for its module, then for the mount callback.
    await import("../src/shell/toolbar-factory.js");
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    // One toolbar and one tab list: the grid's own built-ins are suppressed.
    expect(host.querySelectorAll('[role="toolbar"]')).toHaveLength(1);
    expect(host.querySelectorAll('[role="tablist"]')).toHaveLength(1);
    expect(host.querySelectorAll('[role="grid"]')).toHaveLength(1);

    // Tab activation switches by id.
    const tabButtons = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    tabButtons[1]!.click();
    expect(shell.grid.getActiveSheet()).toBe("s2");

    const root = shell.element;
    shell.destroy();
    shell.destroy(); // idempotent
    expect(host.contains(root)).toBe(false);
  });

  it("honors live tabs false configuration without creating a second primitive", () => {
    const host = mountHost();
    const shell = createSpreadsheetShell(host, {
      grid: {
        workbook: makeWorkbook(10),
        data: makeColumnarData(10),
        config: { tabs: false },
      },
    });

    expect(host.querySelector(".sheetwrite-shell-tabs")).toBeNull();
    shell.setGridConfig({ tabs: true });
    expect(host.querySelectorAll(".sheetwrite-shell-tabs [role='tab']")).toHaveLength(1);
    const add = host.querySelector<HTMLButtonElement>(
      ".sheetwrite-shell-tabs [aria-label='Add sheet']",
    );
    if (!add) throw new Error("expected one-sheet Add action");
    add.click();
    expect(shell.grid.store.getWorkbook().sheets).toHaveLength(2);
    expect(host.querySelectorAll(".sheetwrite-shell-tabs [role='tab']")).toHaveLength(2);
    shell.setGridConfig({ tabs: false });
    expect(host.querySelector(".sheetwrite-shell-tabs")).toBeNull();

    shell.destroy();
  });

  it("keeps an open tab menu when a cell edit does not change the sheet list", () => {
    const host = mountHost();
    const shell = createSpreadsheetShell(host, {
      grid: { workbook: multiSheetWorkbook(), data: makeColumnarData(10) },
    });
    const trigger = host.querySelector<HTMLButtonElement>(
      ".sheetwrite-shell-tabs .sheetwrite-tab-options-button",
    );
    if (!trigger) throw new Error("expected the active tab's options button");
    trigger.click();
    expect(host.querySelector(".sheetwrite-tab-menu")).not.toBeNull();

    shell.grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: "remote edit" },
        },
      ],
    });
    expect(host.querySelector(".sheetwrite-tab-menu")).not.toBeNull();

    shell.grid.applyTransaction({ patches: [{ op: "renameSheet", sheet: "s2", name: "Renamed" }] });
    expect(host.querySelector(".sheetwrite-shell-tabs")?.textContent).toContain("Renamed");

    shell.destroy();
  });

  it("keeps read-only and config wrappers coherent with the shell chrome", async () => {
    const host = mountHost();
    const shell = createSpreadsheetShell(host, {
      grid: { workbook: multiSheetWorkbook(), data: makeColumnarData(10) },
    });

    shell.setReadOnly(true);
    const formula = host.querySelector(".sheetwrite-shell-formula");
    if (!(formula instanceof HTMLInputElement)) throw new Error("expected formula input");
    expect(formula.readOnly).toBe(true);
    expect(host.querySelector('[role="grid"]')?.getAttribute("aria-readonly")).toBe("true");

    // Reconfiguring can never resurrect a second toolbar or tab list.
    shell.setGridConfig({ toolbar: true, tabs: true, find: false });
    await import("../src/shell/toolbar-factory.js");
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    expect(host.querySelectorAll('[role="toolbar"]')).toHaveLength(1);
    expect(host.querySelectorAll('[role="tablist"]')).toHaveLength(1);

    shell.setTheme({ bg: "#123456" });
    expect(shell.element.style.getPropertyValue("--sheetwrite-widget-bg")).toBe("#123456");
    shell.setActiveSheet("s2");
    expect(shell.grid.getActiveSheet()).toBe("s2");

    shell.destroy();
  });
});
