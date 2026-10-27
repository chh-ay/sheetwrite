import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { ContextMenu } from "../src/context-menu.js";
import { createGrid, DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellAddress, Grid, GridActions, GridConfig, Selection } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreCanvasStubs: () => void;
let clipboardDescriptor: PropertyDescriptor | undefined;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvasStubs = installCanvasTestStubs();
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
});

afterEach(() => {
  restoreCanvasStubs();
  if (clipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
  document.body.innerHTML = "";
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

describe("ContextMenu", () => {
  it("executes representative built-ins against a live grid", async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          copied.push(text);
          return Promise.resolve();
        },
      },
    });
    const host = mountHost();
    const grid = createGrid(host, {
      workbook: makeWorkbook(3),
      data: makeColumnarData(3),
      config: { contextMenu: false, find: false, toolbar: false },
    });
    const menu = new ContextMenu(
      host,
      {
        contextMenu: [
          { id: "copy", action: "copy" },
          { id: "insert-row", action: "insertRowBelow" },
          { id: "hide-column", action: "hideColumn" },
          { id: "merge", action: "merge" },
        ],
      },
      DEFAULT_THEME,
      grid.actions,
      grid,
    );
    const click = (id: string, selection: Selection, cell: CellAddress): void => {
      grid.setSelection(selection);
      menu.open({ cell, clientX: 0, clientY: 0 });
      host.querySelector<HTMLElement>(`[data-context-menu-item="${id}"]`)!.click();
    };

    const first = { sheet: "s1", row: 0, col: 0 };
    click("copy", { kind: "cell", addr: first }, first);
    await Promise.resolve();
    expect(copied).toEqual(["Customer 0"]);

    click("insert-row", { kind: "cell", addr: first }, first);
    expect(grid.store.getWorkbook().sheets[0]!.rowCount).toBe(4);

    const thirdColumn = { sheet: "s1", row: 0, col: 2 };
    click("hide-column", { kind: "cell", addr: thirdColumn }, thirdColumn);
    expect(grid.store.getWorkbook().sheets[0]!.columns[2]!.visible).toBe(false);

    click(
      "merge",
      {
        kind: "range",
        range: {
          sheet: "s1",
          start: { row: 0, col: 0 },
          end: { row: 1, col: 1 },
        },
      },
      first,
    );
    expect(grid.store.getWorkbook().sheets[0]!.merges).toEqual([{ r0: 0, c0: 0, r1: 1, c1: 1 }]);

    menu.destroy();
    grid.destroy();
  });

  it("dispatches every built-in action to its GridActions method", () => {
    const host = mountHost();
    const calls: PropertyKey[] = [];
    const actions = new Proxy(
      {},
      {
        get: (_target, property) => () => {
          calls.push(property);
        },
      },
    ) as GridActions;
    const actionMethods = [
      ["cut", "cut"],
      ["paste", "paste"],
      ["clearContents", "clearContents"],
      ["unmerge", "unmerge"],
      ["insertRowAbove", "insertRowAbove"],
      ["deleteRow", "deleteRow"],
      ["hideRow", "hideRows"],
      ["showAllRows", "showRows"],
      ["autoFitRow", "autoFitRows"],
      ["insertColumnLeft", "insertColumnLeft"],
      ["insertColumnRight", "insertColumnRight"],
      ["deleteColumn", "deleteColumn"],
      ["showAllColumns", "showColumns"],
      ["autoFitColumn", "autoFitColumns"],
      ["clearFilter", "clearFilter"],
      ["exportCsv", "exportCsv"],
      ["exportXlsx", "exportXlsx"],
    ] as const;
    const menu = new ContextMenu(
      host,
      {
        contextMenu: [
          ...actionMethods.map(([action]) => ({ id: action, action })),
          { id: "no-op", label: "No operation" },
        ],
      },
      DEFAULT_THEME,
      actions,
      {} as Grid,
    );

    for (const [action] of actionMethods) {
      menu.open({ cell: null, clientX: 0, clientY: 0 });
      host.querySelector<HTMLElement>(`[data-context-menu-item="${action}"]`)!.click();
    }
    menu.open({ cell: null, clientX: 0, clientY: 0 });
    host.querySelector<HTMLElement>('[data-context-menu-item="no-op"]')!.click();

    expect(calls).toEqual(actionMethods.map(([, method]) => method));
    menu.destroy();
  });

  it("passes the opened cell to custom actions and dismisses on outside input", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const cell: CellAddress = { sheet: "s1", row: 4, col: 2 };
    const received: Array<CellAddress | null> = [];
    const grid = {} as Grid;
    const menu = new ContextMenu(
      host,
      {
        contextMenu: [
          {
            label: "Inspect",
            onClick: (receivedGrid, address) => {
              expect(receivedGrid).toBe(grid);
              received.push(address);
            },
          },
        ],
      },
      DEFAULT_THEME,
      {} as GridActions,
      grid,
    );
    const element = host.querySelector<HTMLElement>(".sheetwrite-context-menu")!;

    const open = (x: number, y: number, address: CellAddress | null): void => {
      menu.open({
        cell: address,
        clientX: x,
        clientY: y,
      });
    };
    open(-10, -20, cell);
    expect(element.style.left).toBe("0px");
    expect(element.style.top).toBe("0px");
    host.querySelector<HTMLElement>(".sheetwrite-context-menu-item")!.click();
    expect(received).toEqual([cell]);

    open(20, 20, null);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(element.style.display).toBe("none");
    open(20, 20, null);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(element.style.display).toBe("none");
    open(20, 20, null);
    window.dispatchEvent(new Event("resize"));
    expect(element.style.display).toBe("none");
    open(20, 20, null);
    window.dispatchEvent(new Event("scroll"));
    expect(element.style.display).toBe("none");

    menu.destroy();
    expect(host.querySelector(".sheetwrite-context-menu")).toBeNull();
  });

  const rowsOf = (menu: Element): HTMLElement[] => [
    ...menu.querySelectorAll<HTMLElement>(":scope > .sheetwrite-context-menu-item"),
  ];
  /** Rows of one open menu, in order, as their stable ids. */
  const rowIds = (menu: Element): (string | undefined)[] =>
    rowsOf(menu).map((row) => row.dataset.contextMenuItem);
  const openMenus = (host: HTMLElement): HTMLElement[] =>
    [...host.querySelectorAll<HTMLElement>(".sheetwrite-context-menu")].filter(
      (menu) => menu.style.display !== "none",
    );
  /** The open menu at `level` (0 is the root); throws when that menu is not open. */
  const openMenu = (host: HTMLElement, level = 0): HTMLElement => {
    const menu = openMenus(host)[level];
    if (menu === undefined) throw new Error(`No context menu is open at level ${level}`);
    return menu;
  };
  const focusedId = (): string | undefined => {
    const active = document.activeElement;
    return active instanceof HTMLElement ? active.dataset.contextMenuItem : undefined;
  };
  const key = (target: Element | null, name: string): void => {
    target?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  };

  function liveMenu(config: GridConfig = {}) {
    const host = mountHost();
    const grid = createGrid(host, {
      workbook: makeWorkbook(3),
      data: makeColumnarData(3),
      config: { contextMenu: false, find: false, toolbar: false },
    });
    const menu = new ContextMenu(host, config, DEFAULT_THEME, grid.actions, grid);
    return { host, grid, menu };
  }

  it("groups the default menu into short sections with submenus and icons", () => {
    const { host, grid, menu } = liveMenu({ icons: { copy: "C" } });
    const cell = { sheet: "s1", row: 0, col: 0 };
    grid.setSelection({ kind: "cell", addr: cell });
    menu.open({ cell, clientX: 10, clientY: 10 });

    const root = openMenu(host);
    expect(rowIds(root)).toEqual([
      "cut",
      "copy",
      "paste",
      "insert",
      "delete",
      "clearContents",
      "row",
      "column",
      "mergeMenu",
      "editNote",
    ]);
    // Built-in rows show the command glyph; a host override replaces it.
    expect(root.querySelector('.sheetwrite-icon[data-icon="cut"]')).not.toBeNull();
    expect(
      root.querySelector('[data-context-menu-item="copy"] .sheetwrite-context-menu-icon')
        ?.textContent,
    ).toBe("C");

    const insert = root.querySelector<HTMLElement>('[data-context-menu-item="insert"]');
    expect(insert?.getAttribute("aria-haspopup")).toBe("menu");
    insert?.click();
    expect(rowIds(openMenu(host, 1))).toEqual([
      "insertRowAbove",
      "insertRowBelow",
      "insertColumnLeft",
      "insertColumnRight",
    ]);

    menu.destroy();
    grid.destroy();
  });

  it("moves through the menu and its submenus with the keyboard", () => {
    const { host, grid, menu } = liveMenu();
    const cell = { sheet: "s1", row: 0, col: 0 };
    grid.setSelection({ kind: "cell", addr: cell });
    const before = document.createElement("button");
    host.append(before);
    before.focus();
    menu.open({ cell, clientX: 10, clientY: 10 });

    // Focus moves into the menu so the keys reach it.
    expect(focusedId()).toBe("cut");
    key(document.activeElement, "ArrowDown");
    expect(focusedId()).toBe("copy");
    key(document.activeElement, "End");
    expect(focusedId()).toBe("editNote");
    key(document.activeElement, "Home");
    for (let step = 0; step < 3; step += 1) key(document.activeElement, "ArrowDown");
    expect(focusedId()).toBe("insert");

    // Right opens the submenu on its first row; Left or Escape returns to the parent.
    key(document.activeElement, "ArrowRight");
    expect(openMenus(host)).toHaveLength(2);
    expect(focusedId()).toBe("insertRowAbove");
    key(document.activeElement, "ArrowLeft");
    expect(openMenus(host)).toHaveLength(1);
    expect(focusedId()).toBe("insert");
    key(document.activeElement, "ArrowRight");
    key(document.activeElement, "Escape");
    expect(openMenus(host)).toHaveLength(1);
    expect(focusedId()).toBe("insert");

    // Enter on a submenu row runs it, closes every menu and gives focus back.
    key(document.activeElement, "ArrowRight");
    key(document.activeElement, "ArrowDown");
    key(document.activeElement, "Enter");
    expect(grid.store.getWorkbook().sheets[0]?.rowCount).toBe(4);
    expect(openMenus(host)).toHaveLength(0);
    expect(document.activeElement).toBe(before);

    menu.destroy();
    grid.destroy();
  });

  it("offers to edit and delete a note only where the cell has one", () => {
    const { host, grid, menu } = liveMenu();
    const plain = { sheet: "s1", row: 0, col: 0 };
    const noted = { sheet: "s1", row: 1, col: 0 };
    grid.setNote(noted, "Checked by finance");

    menu.open({ cell: plain, clientX: 10, clientY: 10 });
    expect(rowIds(openMenu(host)).slice(-2)).toEqual(["mergeMenu", "editNote"]);
    menu.close();

    menu.open({ cell: noted, clientX: 10, clientY: 10 });
    expect(rowIds(openMenu(host)).slice(-2)).toEqual(["editNote", "deleteNote"]);

    menu.destroy();
    grid.destroy();
  });
});
