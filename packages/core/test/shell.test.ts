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
import { answerDialog, makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

/** Teardown of each test's grids and shell pieces, newest first. */
const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  restoreStubs();
});

function makeGrid(rowCount = 20): { grid: Grid; store: SheetwriteStore; host: HTMLDivElement } {
  const workbook = makeWorkbook(rowCount);
  const store = new SheetwriteStore(workbook, makeColumnarData(rowCount));
  const host = mountHost();
  const grid = new GridImpl(host, { workbook }, store);
  cleanups.push(
    () => store.dispose(),
    () => grid.destroy(),
  );
  return { grid, store, host };
}

function track<T extends { destroy(): void }>(piece: T): T {
  cleanups.push(() => piece.destroy());
  return piece;
}

/** A name box over a 20-row grid; `enter` types a reference and presses Enter. */
function mountNameBox(options: Parameters<typeof createNameBox>[2] = {}) {
  const { grid, host } = makeGrid();
  const input = track(createNameBox(host, grid, options)).element as HTMLInputElement;
  const enter = (reference: string): void => {
    input.value = reference;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
  };
  return { grid, input, enter };
}

function mountFormulaBar() {
  const { grid, store, host } = makeGrid();
  const input = track(createFormulaBar(host, grid, {})).element as HTMLTextAreaElement;
  return { grid, store, host, input };
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

describe("Grid.getCellInput", () => {
  it("returns formula source, not the resolved value", () => {
    const { grid } = makeGrid();
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
  });
});

describe("createToolbar", () => {
  it("keeps one-click border, merge, unmerge and clear-format buttons in custom toolbars", async () => {
    const { grid, store, host } = makeGrid();
    const piece = track(
      createToolbar(host, grid, {
        items: [
          { action: "border" },
          { action: "merge" },
          { action: "unmerge" },
          { action: "clearFormat" },
        ],
      }),
    );
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
    // A1:B2 holds values, so the merge asks first, as in Excel.
    await answerDialog(host, "OK");
    expect(grid.store.getWorkbook().sheets[0]?.merges ?? []).toHaveLength(1);
    await click("unmerge");
    expect(grid.store.getWorkbook().sheets[0]?.merges ?? []).toHaveLength(0);
    await click("clearFormat");
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).style.bold).not.toBe(true);
  });

  it("draws no separator that an unavailable command leaves, from its first paint", () => {
    // No XLSX add-on is registered, so Import XLSX, the first command, is unavailable.
    const { grid, host } = makeGrid();
    const piece = track(createToolbar(host, grid));
    const importButton = piece.element.querySelector('[aria-label="Import XLSX"]');
    if (importButton === null) throw new Error("the toolbar has no Import XLSX button");
    expect(importButton.closest("[hidden]")).not.toBeNull();
    // Read before any animation frame runs: what the browser paints first.
    const row = piece.element.querySelector(".sheetwrite-command-toolbar-row");
    if (row === null) throw new Error("the toolbar has no row");
    const shown = [...row.children].filter((item) => item instanceof HTMLElement && !item.hidden);
    const isSeparator = (item: Element | undefined): boolean =>
      item?.getAttribute("role") === "separator";
    expect(isSeparator(shown[0])).toBe(false);
    expect(isSeparator(shown.at(-1))).toBe(false);
    expect(shown.some((item, index) => isSeparator(item) && isSeparator(shown[index + 1]))).toBe(
      false,
    );
  });

  it("moves keyboard focus within toolbar bounds and ignores unrelated keys", () => {
    const { grid, host } = makeGrid();
    const piece = track(
      createToolbar(host, grid, {
        label: "Editing",
        items: [
          { onClick: () => {}, title: "One" },
          { onClick: () => {}, title: "Two" },
          { onClick: () => {}, title: "Three" },
        ],
      }),
    );
    const controls = [...piece.element.querySelectorAll<HTMLButtonElement>("button")];
    controls[1]!.focus();
    for (const [key, expected] of [
      ["ArrowLeft", 0],
      ["ArrowRight", 1],
      ["End", 2],
      ["ArrowRight", 2],
      ["Home", 0],
      ["ArrowLeft", 0],
      ["Enter", 0],
    ] as const) {
      piece.element.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      expect(document.activeElement, key).toBe(controls[expected]!);
    }
    expect(piece.element.getAttribute("role")).toBe("toolbar");
    expect(piece.element.getAttribute("aria-label")).toBe("Editing");
  });
});

describe("createNameBox", () => {
  it("follows the selection and jumps on Enter within bounds", () => {
    let focused = 0;
    const { grid, input, enter } = mountNameBox({ focusGrid: () => focused++ });

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

    enter("b3");
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s1", row: 2, col: 1 } });
    expect(focused).toBe(1);

    // Ranges select like Excel's name box; $ anchors are ignored.
    enter("a2:$C$4");
    expect(grid.getSelection()).toEqual({
      kind: "range",
      range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 3, col: 2 } },
    });
  });

  it("takes a cell right of the sheet's columns that the grid shows", () => {
    const { grid, input, enter } = mountNameBox();
    // The sheet has columns A to C; the test host's width shows empty columns up to I.
    enter("H2");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s1", row: 1, col: 7 } });

    enter("J2");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("shows and reads the sheet's row numbers under a filter, as Excel does", () => {
    const { grid, input, enter } = mountNameBox();
    // Only the Tokyo rows show: sheet rows 2, 5, 8 and so on.
    grid.filterBy(2, "Tokyo");
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });
    expect(input.value).toBe("A5");

    enter("B8");
    expect(grid.getSelection()).toEqual({ kind: "cell", addr: { sheet: "s1", row: 2, col: 1 } });
    expect(input.value).toBe("B8");

    // A range selects the rows of it that show.
    enter("A2:B8");
    expect(grid.getSelection()).toEqual({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 2, col: 1 } },
    });

    // A cell whose row the filter hides becomes the active cell, as in Excel.
    enter("A3");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.value).toBe("A3");
    expect(grid.getSelection()).toBeNull();
    expect(grid.getActiveSheetCell()).toEqual({ sheet: "s1", row: 2, col: 0 });
  });

  it("marks invalid or out-of-bounds references without touching the grid", () => {
    const { grid, input, enter } = mountNameBox();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
    const before = grid.getSelection();

    for (const bad of ["", "5B", "A0", "ZZ9", "A999", "A1:", "A1:A999"]) {
      enter(bad);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(grid.getSelection()).toEqual(before);
    }
  });
});

describe("createFormulaBar", () => {
  it("commits through the undoable grid path at the captured data address", () => {
    const { grid, store, input } = mountFormulaBar();
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
  });

  it("never overwrites a focused dirty draft and restores on Escape", () => {
    const { grid, input } = mountFormulaBar();
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
  });

  it("does not open the cell editor from the bar in read-only mode", () => {
    const { grid, host, input } = mountFormulaBar();
    grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 2, col: 0 } });
    grid.setReadOnly(true);
    input.focus();
    input.value = "x";
    input.dispatchEvent(new InputEvent("input", { inputType: "insertText" }));
    expect(host.querySelector("textarea.sheetwrite-editor")).toBeNull();
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
    if (!(formula instanceof HTMLTextAreaElement)) throw new Error("expected formula textarea");
    expect(formula.readOnly).toBe(true);
    expect(host.querySelector('[role="grid"]')?.getAttribute("aria-readonly")).toBe("true");

    // Tabs follow a live config, and reconfiguring never adds a second toolbar or tab list.
    shell.setGridConfig({ tabs: false });
    expect(host.querySelector(".sheetwrite-shell-tabs")).toBeNull();
    shell.setGridConfig({ toolbar: true, tabs: true, find: false });
    await import("../src/shell/toolbar-factory.js");
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    expect(host.querySelectorAll('[role="toolbar"]')).toHaveLength(1);
    expect(host.querySelectorAll('[role="tablist"]')).toHaveLength(1);

    shell.setTheme({ bg: "#123456" });
    expect(shell.element.style.getPropertyValue("--sheetwrite-widget-bg")).toBe("#123456");

    shell.destroy();
  });
});

describe("the formula bar's formula help", () => {
  it("takes the grid's theme colours", async () => {
    // The core stylesheet's dark palette (`styles/grid.css`), which differs from the defaults.
    const theme = { bg: "#0b0b0c", fg: "#e7e7e7" };
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook, makeColumnarData(5));
    const host = mountHost();
    const grid = new GridImpl(host, { workbook, theme }, store);
    cleanups.push(
      () => store.dispose(),
      () => grid.destroy(),
    );
    const input = track(createFormulaBar(host, grid, {})).element as HTMLTextAreaElement;

    input.focus();
    input.value = "=SUM(";
    input.dispatchEvent(new Event("input"));
    // The help loads its chunk on the first formula, then adds its layer.
    const findLayer = () => document.querySelector<HTMLElement>(".sheetwrite-formula-help");
    const { promise: added, resolve } = Promise.withResolvers<HTMLElement>();
    const observer = new MutationObserver(() => {
      const layer = findLayer();
      if (layer !== null) resolve(layer);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const layer = findLayer() ?? (await added);
    observer.disconnect();

    const background = layer.style.getPropertyValue("--sheetwrite-assist-bg");
    const text = layer.style.getPropertyValue("--sheetwrite-assist-fg");
    expect([background, text]).toEqual([theme.bg, theme.fg]);
  });
});
