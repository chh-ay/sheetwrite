import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { expectSame } from "../../../test/expect-same.js";
import { ContextMenu } from "../src/context-menu.js";
import { createGrid, DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid, GridActions, GridConfig } from "../src/types.js";
import { makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

let restore_canvas_stubs: () => void;
let clipboard_descriptor: PropertyDescriptor | undefined;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restore_canvas_stubs = installCanvasTestStubs();
  clipboard_descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
});

/** Each live menu and its grid, destroyed after its test. */
const live: (() => void)[] = [];

afterEach(() => {
  for (const destroy of live.splice(0)) destroy();
  restore_canvas_stubs();
  if (clipboard_descriptor) {
    Object.defineProperty(navigator, "clipboard", clipboard_descriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
  document.body.innerHTML = "";
});

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
    const action_methods = [
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
      ["insertCells", "insertCells"],
      ["deleteCells", "deleteCells"],
    ] as const;
    const menu = new ContextMenu(
      host,
      {
        contextMenu: [
          ...action_methods.map(([action]) => ({ id: action, action })),
          { id: "no-op", label: "No operation" },
        ],
      },
      DEFAULT_THEME,
      actions,
      {} as Grid,
    );

    for (const [action] of action_methods) {
      menu.open({ cell: null, clientX: 0, clientY: 0 });
      host.querySelector<HTMLElement>(`[data-context-menu-item="${action}"]`)!.click();
    }
    menu.open({ cell: null, clientX: 0, clientY: 0 });
    host.querySelector<HTMLElement>('[data-context-menu-item="no-op"]')!.click();

    expect(calls).toEqual(action_methods.map(([, method]) => method));
    menu.destroy();
  });

  const rows_of = (menu: Element): HTMLElement[] => [
    ...menu.querySelectorAll<HTMLElement>(":scope > .sheetwrite-context-menu-item"),
  ];
  /** Rows of one open menu, in order, as their stable ids. */
  const row_ids = (menu: Element): (string | undefined)[] =>
    rows_of(menu).map((row) => row.dataset.contextMenuItem);
  const open_menus = (host: HTMLElement): HTMLElement[] =>
    [...host.querySelectorAll<HTMLElement>(".sheetwrite-context-menu")].filter(
      (menu) => menu.style.display !== "none",
    );
  /** The open menu at `level` (0 is the root); throws when that menu is not open. */
  const open_menu = (host: HTMLElement, level = 0): HTMLElement => {
    const menu = open_menus(host)[level];
    if (menu === undefined) throw new Error(`No context menu is open at level ${level}`);
    return menu;
  };
  const focused_id = (): string | undefined => {
    const active = document.activeElement;
    return active instanceof HTMLElement ? active.dataset.contextMenuItem : undefined;
  };
  const key = (target: Element | null, name: string): void => {
    target?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  };

  function live_menu(config: GridConfig = {}) {
    const host = mountHost();
    const grid = createGrid(host, {
      workbook: makeWorkbook(3),
      data: makeColumnarData(3),
      config: { contextMenu: false, find: false, toolbar: false },
    });
    const menu = new ContextMenu(host, config, DEFAULT_THEME, grid.actions, grid);
    live.push(
      () => menu.destroy(),
      () => grid.destroy(),
    );
    return { host, grid, menu };
  }

  it("offers PivotTable Fields only on a pivot's output, and not on a read-only grid", () => {
    const { host, grid, menu } = live_menu();
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
    /** Open the menu on a cell; returns its row ids. */
    const open_at = (row: number, col: number) => {
      const cell = { sheet: "s1", row, col };
      grid.setSelection({ kind: "cell", addr: cell });
      menu.open({ cell, clientX: 10, clientY: 10 });
      const ids = row_ids(open_menu(host));
      menu.close();
      return ids;
    };

    expect(open_at(0, 2)).toContain("pivotFields");
    expect(open_at(2, 0)).not.toContain("pivotFields");

    grid.setReadOnly(true);
    expect(open_at(0, 2)).not.toContain("pivotFields");
  });

  it("shows Excel's cell dialogs: Cells… first in Insert and Delete, and Format cells…", () => {
    const { host, grid, menu } = live_menu();
    const cell = { sheet: "s1", row: 1, col: 1 };
    grid.setSelection({ kind: "cell", addr: cell });
    menu.open({ cell, clientX: 10, clientY: 10 });
    const open_submenu = (id: string): void =>
      open_menu(host).querySelector<HTMLElement>(`[data-context-menu-item="${id}"]`)!.click();

    expect(row_ids(open_menu(host))).toContain("formatCells");
    open_submenu("insert");
    expect(row_ids(open_menu(host, 1))[0]).toBe("insertCells");
    open_submenu("delete");
    expect(row_ids(open_menu(host, 1))[0]).toBe("deleteCells");
  });

  it("moves through the menu and its submenus with the keyboard", () => {
    const { host, grid, menu } = live_menu();
    const cell = { sheet: "s1", row: 0, col: 0 };
    grid.setSelection({ kind: "cell", addr: cell });
    const before = document.createElement("button");
    host.append(before);
    before.focus();
    menu.open({ cell, clientX: 10, clientY: 10 });

    // Focus moves into the menu so the keys reach it.
    expect(focused_id()).toBe("cut");
    key(document.activeElement, "ArrowDown");
    expect(focused_id()).toBe("copy");
    key(document.activeElement, "End");
    expect(focused_id()).toBe("editNote");
    key(document.activeElement, "Home");
    // Cut, Copy, the Paste Options row (one stop), Paste Special…, then Insert.
    for (let step = 0; step < 4; step += 1) key(document.activeElement, "ArrowDown");
    expect(focused_id()).toBe("insert");

    // Right opens the submenu on its first row; Left or Escape returns to the parent.
    key(document.activeElement, "ArrowRight");
    expect(open_menus(host)).toHaveLength(2);
    expect(focused_id()).toBe("insertCells");
    key(document.activeElement, "ArrowLeft");
    expect(open_menus(host)).toHaveLength(1);
    expect(focused_id()).toBe("insert");
    key(document.activeElement, "ArrowRight");
    key(document.activeElement, "Escape");
    expect(open_menus(host)).toHaveLength(1);
    expect(focused_id()).toBe("insert");

    // Enter on a submenu row runs it, closes every menu and gives focus back.
    key(document.activeElement, "ArrowRight");
    key(document.activeElement, "ArrowDown");
    key(document.activeElement, "Enter");
    expect(grid.store.getWorkbook().sheets[0]?.rowCount).toBe(4);
    expect(open_menus(host)).toHaveLength(0);
    expectSame(document.activeElement, before);
  });

  it("closes on the user's scroll, not on the page's own", () => {
    const { host, menu } = live_menu();
    const open = (): void => menu.open({ cell: null, clientX: 10, clientY: 10 });

    // Focusing the grid scrolls it into view, and the browser sends that scroll
    // event at its next frame, which can come after a right-click opened the menu.
    open();
    document.dispatchEvent(new Event("scroll"));
    expect(open_menus(host)).toHaveLength(1);

    // A wheel turn over the menu does not scroll the page.
    open_menu(host).dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 40 }));
    expect(open_menus(host)).toHaveLength(1);

    document.body.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 40 }));
    expect(open_menus(host)).toHaveLength(0);

    open();
    document.body.dispatchEvent(new Event("touchmove", { bubbles: true }));
    expect(open_menus(host)).toHaveLength(0);

    // Page Down is not a menu key, so it scrolls the page.
    open();
    key(document.activeElement, "PageDown");
    expect(open_menus(host)).toHaveLength(0);
  });
});
