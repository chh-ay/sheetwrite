import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { ContextMenu } from "../src/context-menu.js";
import { createGrid, DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid, GridActions, GridConfig } from "../src/types.js";
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

  it("offers PivotTable Fields only on a pivot's output, and not on a read-only grid", () => {
    const { host, grid, menu } = liveMenu();
    // A pivot over A1:B3 with its output anchored at C1. The default engine keeps
    // the definition without output, so the anchor alone is the output cell.
    const placed = grid.setPivot(
      {
        id: "p1",
        name: "By name",
        source: { range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 2, col: 1 } } },
        anchor: { row: 0, col: 2 },
        rows: [0],
        columns: [],
        values: [{ field: 1, aggregation: "SUM" }],
      },
      "s1",
    );
    expect(placed.status).toBe("applied");
    /** Open the menu on a cell; returns its row ids and whether the pivot row shows its glyph. */
    const openAt = (row: number, col: number) => {
      const cell = { sheet: "s1", row, col };
      grid.setSelection({ kind: "cell", addr: cell });
      menu.open({ cell, clientX: 10, clientY: 10 });
      const root = openMenu(host);
      const ids = rowIds(root);
      const glyph = root.querySelector(
        '[data-context-menu-item="pivotFields"] [data-icon="pivotTable"]',
      );
      menu.close();
      return { ids, glyph: glyph !== null };
    };

    expect(openAt(0, 2)).toEqual(expect.objectContaining({ glyph: true }));
    expect(openAt(0, 2).ids).toContain("pivotFields");
    expect(openAt(2, 0).ids).not.toContain("pivotFields");

    grid.setReadOnly(true);
    expect(openAt(0, 2).ids).not.toContain("pivotFields");

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
});
