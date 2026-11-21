import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { type SheetTabRecord, SheetTabs, type SheetTabsOptions } from "../src/sheet-tabs.js";
import type { SheetLifecycleResult } from "../src/types/grid.js";
import { expectSameNode, pressLikeWebKit } from "./fixtures.js";

const SHEETS: readonly SheetTabRecord[] = [
  { id: "a", name: "Sales" },
  { id: "b", name: "Sales" }, // duplicate display text proves identity remains ID-based
  { id: "c", name: "Summary" },
];

function applied(sheet: string): SheetLifecycleResult {
  return {
    status: "applied",
    epoch: 1,
    transaction: { patches: [] },
    sheet,
  };
}

function rejected(
  sheet: string,
  message: string,
  code: "blank" | "duplicate" | "last-visible-sheet" = "duplicate",
): SheetLifecycleResult {
  return {
    status: "rejected",
    epoch: 1,
    sheet,
    issues: [
      {
        kind: "sheet-lifecycle",
        severity: "error",
        code,
        sheet,
        operationIndex: 0,
        message,
      },
    ],
  };
}

function tabButtons(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function inputText(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function key(target: EventTarget, value: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, ...init }));
}

describe("SheetTabs", () => {
  let host: HTMLDivElement;
  let tabs: SheetTabs;
  let activated: string[];

  beforeEach(() => {
    document.body.replaceChildren();
    host = document.createElement("div");
    host.style.width = "390px";
    host.style.overflowX = "auto";
    document.body.appendChild(host);
    activated = [];
    tabs = new SheetTabs(host, { onActivate: (id) => activated.push(id) });
    tabs.update(SHEETS, "b");
  });

  function remount(
    options: SheetTabsOptions,
    sheets: readonly SheetTabRecord[] = SHEETS,
    active = "b",
  ): void {
    tabs.destroy();
    tabs = new SheetTabs(host, options);
    tabs.update(sheets, active);
  }

  afterEach(() => {
    tabs.destroy();
    document.body.replaceChildren();
  });

  it("opens a sheet's menu on a right-click on its tab, as Excel does", () => {
    remount({
      onActivate: (id) => {
        activated.push(id);
        tabs.update(SHEETS, id);
      },
      onRename: (id) => applied(id),
    });

    const menuEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    tabButtons(host)[2]!.dispatchEvent(menuEvent);
    expect(menuEvent.defaultPrevented).toBe(true);
    expect(activated).toEqual(["c"]);
    const menu = host.querySelector('[role="menu"]');
    expect(menu?.getAttribute("aria-label")).toBe("Summary sheet options");
  });

  it("gives the new sheet the keys after +, not the tab that last had focus", () => {
    const focused: string[] = [];
    let sheets = SHEETS;
    remount({
      onActivate: (id) => tabs.update(sheets, id),
      focusSheet: () => focused.push("grid"),
      onAdd: (index) => {
        sheets = [
          ...sheets.slice(0, index),
          { id: `new${index}`, name: "Sheet4" },
          ...sheets.slice(index),
        ];
        tabs.update(sheets, `new${index}`);
        return applied(`new${index}`);
      },
    });
    // The grid moves to Summary by its keys (Ctrl+PageDown); no tab has had focus.
    tabs.update(sheets, "c");
    const add = host.querySelector<HTMLButtonElement>('[aria-label="Add sheet"]')!;
    add.focus();
    add.click();
    expect(document.activeElement?.getAttribute("data-sheet-id")).toBe("new3");
    add.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(focused).toEqual(["grid"]);
  });

  it("does not remove the last visible sheet or remove a tab with Backspace", () => {
    const removed: string[] = [];
    remount(
      {
        onActivate: () => {},
        onRemove: (id) => {
          removed.push(id);
          return applied(id);
        },
      },
      [{ id: "a", name: "Only" }],
      "a",
    );
    tabButtons(host)[0]?.focus();
    key(host, "Delete");
    expect(removed).toEqual([]);

    tabs.update(SHEETS, "a");
    tabButtons(host)[0]?.focus();
    key(host, "Backspace");
    expect(removed).toEqual([]);
  });

  it("renames inline by double-click and F2, committing Enter or changed blur and cancelling Escape", () => {
    const renames: Array<[string, string]> = [];
    remount({
      onActivate: () => {},
      onRename: (id, name) => {
        renames.push([id, name]);
        return applied(id);
      },
    });

    tabButtons(host)[1]!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    let input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    // The editor sits outside the tab list, which keeps the selected tab.
    expect(input.closest('[role="tablist"]')).toBeNull();
    expect(
      host.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]'),
    ).not.toBeNull();
    inputText(input, "Revenue");
    key(input, "Enter");
    expect(renames).toEqual([["b", "Revenue"]]);
    expect(host.querySelector(".sheetwrite-tab-input")).toBeNull();

    tabButtons(host)[1]!.focus();
    key(host, "F2");
    input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    inputText(input, "Forecast");
    input.blur();
    expect(renames.at(-1)).toEqual(["b", "Forecast"]);
    expect(host.querySelector(".sheetwrite-tab-input")).toBeNull();

    tabButtons(host)[1]!.focus();
    key(host, "F2");
    input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    inputText(input, "Cancelled");
    key(input, "Escape");
    expect(renames).toHaveLength(2);
    expectSameNode(document.activeElement, tabButtons(host)[1]!);

    key(host, "F2");
    input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    input.blur();
    expect(renames).toHaveLength(2);
  });

  it("does not commit Enter during IME composition", () => {
    const renames: string[] = [];
    remount({
      onActivate: () => {},
      onRename: (id, name) => {
        renames.push(`${id}:${name}`);
        return applied(id);
      },
    });
    tabButtons(host)[1]!.focus();
    key(host, "F2");
    const input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    inputText(input, "売上");
    key(input, "Enter");
    expect(renames).toEqual([]);
    expectSameNode(host.querySelector(".sheetwrite-tab-input"), input);

    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "売上" }));
    key(input, "Enter");
    expect(renames).toEqual(["b:売上"]);
  });

  it("keeps invalid Enter and blur edits focused with their structured lifecycle error associated", () => {
    // Rejection messages come from the host; the tabs forward them unchanged.
    const duplicateMessage = "host duplicate message";
    const blankMessage = "host blank message";
    const attempts: string[] = [];
    remount({
      onActivate: () => {},
      onRename: (id, name) => {
        attempts.push(name);
        return name.length === 0
          ? rejected(id, blankMessage, "blank")
          : rejected(id, duplicateMessage, "duplicate");
      },
    });
    host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Rename Sales sheet"]')!.click();

    let input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    inputText(input, "Summary");
    key(input, "Enter");
    input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    const error = host.querySelector<HTMLElement>('[role="alert"]')!;
    expectSameNode(document.activeElement, input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(error.textContent).toBe(duplicateMessage);
    expect(error.dataset.code).toBe("duplicate");

    // A blur keeps the rejected edit open as Enter does.
    inputText(input, "");
    input.blur();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(blankMessage);
    expect(attempts).toEqual(["Summary", ""]);
  });

  it("exposes lifecycle actions through an accessible active-sheet menu and keyboard shortcuts", () => {
    const actions: string[] = [];
    const options: SheetTabsOptions = {
      onActivate: () => {},
      onAdd: () => {
        actions.push("add");
        return applied("new");
      },
      onRemove: (id) => {
        actions.push(`remove:${id}`);
        return applied(id);
      },
      onRename: (id) => applied(id),
      onMove: (id, to) => {
        actions.push(`move:${id}:${to}`);
        return applied(id);
      },
      onHide: (id) => {
        actions.push(`hide:${id}`);
        return applied(id);
      },
      onUnhide: (id) => {
        actions.push(`unhide:${id}`);
        return applied(id);
      },
    };
    const workbook = [
      ...SHEETS,
      { id: "hidden", name: "Hidden", visibility: "hidden" as const },
      { id: "secret", name: "Secret", visibility: "veryHidden" as const },
    ];
    remount(options, workbook);

    let trigger = host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!;
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    const tablist = host.querySelector<HTMLElement>('[role="tablist"]')!;
    expect(tablist.getAttribute("aria-label")).toBeTruthy();
    // Only visible sheets are tabs; hidden and very hidden sheets are not.
    expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(trigger.closest('[role="tablist"]')).toBeNull();
    trigger.focus();
    key(trigger, "ArrowDown");

    const menu = host.querySelector<HTMLElement>('[role="menu"]')!;
    expect(menu.getAttribute("aria-label")).toBeTruthy();
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(items.length).toBeGreaterThan(1);
    expectSameNode(document.activeElement, items[0]!);
    key(items[0]!, "End");
    expectSameNode(document.activeElement, items.at(-1)!);
    key(items.at(-1)!, "Home");
    expectSameNode(document.activeElement, items[0]!);
    key(items[0]!, "Escape");
    trigger = host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!;
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expectSameNode(document.activeElement, trigger);

    trigger.click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(host.querySelector('[role="menu"]')).toBeNull();

    host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!.click();
    tabs.update(workbook, "b");
    expect(host.querySelector('[role="menu"]')).toBeNull();

    host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Hide Sales sheet"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Remove Sales sheet"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Add sheet"]')!.click();
    const unhide = host.querySelector<HTMLElement>('[aria-label="Unhide sheet"]')!;
    const hiddenChoices = host.querySelector<HTMLElement>(
      '[role="group"][aria-label="Hidden sheets"]',
    )!;
    expect(
      [...hiddenChoices.querySelectorAll("button")].map((button) => button.textContent),
    ).toEqual(["Hidden"]);
    expect(hiddenChoices.hidden).toBe(true);
    unhide.click();
    expect(unhide.getAttribute("aria-expanded")).toBe("true");
    expect(hiddenChoices.hidden).toBe(false);
    key(hiddenChoices.querySelector("button")!, "Escape");
    expect(unhide.getAttribute("aria-expanded")).toBe("false");
    expect(hiddenChoices.hidden).toBe(true);
    expectSameNode(document.activeElement, unhide);
    unhide.click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(unhide.getAttribute("aria-expanded")).toBe("false");
    expect(hiddenChoices.hidden).toBe(true);
    expectSameNode(document.activeElement, unhide);
    unhide.click();
    expect(host.textContent).not.toContain("Secret");
    hiddenChoices.querySelector("button")!.click();

    let active = tabButtons(host)[1]!;
    active.focus();
    key(host, "ArrowLeft", { ctrlKey: true, shiftKey: true });
    active = tabButtons(host)[1]!;
    active.focus();
    key(host, "ArrowRight", { ctrlKey: true, shiftKey: true });
    active = tabButtons(host)[1]!;
    active.focus();
    key(host, "h", { ctrlKey: true, shiftKey: true });
    active = tabButtons(host)[1]!;
    active.focus();
    key(host, "Delete");
    active = tabButtons(host)[1]!;
    active.focus();
    key(host, "F11", { shiftKey: true });
    active = tabButtons(host)[1]!;
    active.focus();
    key(host, "u", { ctrlKey: true, shiftKey: true });

    expect(actions).toEqual([
      "hide:b",
      "remove:b",
      "add",
      "unhide:hidden",
      "move:b:0",
      "move:b:2",
      "hide:b",
      "remove:b",
      "add",
      "unhide:hidden",
    ]);
  });

  it("keeps its menus open for a press on a choice that does not focus the choice", () => {
    const actions: string[] = [];
    remount(
      {
        onActivate: () => {},
        onHide: (id) => {
          actions.push(`hide:${id}`);
          return applied(id);
        },
        onUnhide: (id) => {
          actions.push(`unhide:${id}`);
          return applied(id);
        },
      },
      [...SHEETS, { id: "hidden", name: "Hidden", visibility: "hidden" }],
      "b",
    );

    const trigger = host.querySelector<HTMLButtonElement>(
      '[aria-label="Options for Sales sheet"]',
    )!;
    trigger.focus();
    key(trigger, "ArrowDown");
    pressLikeWebKit(host.querySelector<HTMLButtonElement>('[aria-label="Hide Sales sheet"]')!);

    const unhide = host.querySelector<HTMLButtonElement>('[aria-label="Unhide sheet"]')!;
    unhide.click();
    pressLikeWebKit(host.querySelector('[aria-label="Hidden sheets"]')!.querySelector("button")!);

    expect(actions).toEqual(["hide:b", "unhide:hidden"]);
  });

  it("supports pointer drag reorder and maps drops to workbook indexes through hidden sheets", () => {
    const moves: string[] = [];
    remount(
      {
        onActivate: () => {},
        onMove: (id, to) => {
          moves.push(`${id}:${to}`);
          return applied(id);
        },
      },
      [
        { id: "a", name: "A" },
        { id: "h", name: "H", visibility: "hidden" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ],
      "a",
    );
    const buttons = tabButtons(host);
    expect(buttons.every((button) => button.draggable)).toBe(true);
    buttons[0]!.dispatchEvent(new Event("dragstart", { bubbles: true }));
    buttons[1]!.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    buttons[1]!.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    expect(moves).toEqual(["a:2"]);
  });

  it("reconciles remote rename, reorder, and removal while editing by stable ID", () => {
    remount({
      onActivate: () => {},
      onRename: (id) => applied(id),
    });
    tabButtons(host)[1]!.focus();
    key(host, "F2");
    let input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    inputText(input, "Local draft");

    tabs.update(
      [
        { id: "c", name: "Summary" },
        { id: "b", name: "Remote Sales" },
        { id: "a", name: "Sales" },
      ],
      "b",
    );
    input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    expect(input.value).toBe("Local draft");
    expect(input.dataset.sheetId).toBe("b");
    expectSameNode(document.activeElement, input);
    key(input, "Escape");
    expect(tabButtons(host).map((button) => button.textContent)).toEqual([
      "Summary",
      "Remote Sales",
      "Sales",
    ]);

    tabButtons(host)[1]!.focus();
    key(host, "F2");
    tabs.update(
      [
        { id: "c", name: "Summary" },
        { id: "b", name: "Server final" },
        { id: "a", name: "Sales" },
      ],
      "b",
    );
    expect(host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")?.value).toBe(
      "Server final",
    );

    tabs.update(
      [
        { id: "c", name: "Summary" },
        { id: "a", name: "Sales" },
      ],
      "c",
    );
    expect(host.querySelector(".sheetwrite-tab-input")).toBeNull();
    expectSameNode(document.activeElement, tabButtons(host)[1]!);
    expect(tabButtons(host).map((button) => button.tabIndex)).toEqual([-1, 0]);
  });

  it("suppresses mutation affordances in read-only mode while preserving navigation", () => {
    const actions: string[] = [];
    remount(
      {
        readOnly: true,
        onActivate: () => {},
        onAdd: () => {
          actions.push("add");
          return applied("new");
        },
        onRename: (id) => {
          actions.push("rename");
          return applied(id);
        },
        onHide: (id) => applied(id),
        onUnhide: (id) => applied(id),
      },
      [...SHEETS, { id: "hidden", name: "Hidden", visibility: "hidden" }],
      "b",
    );
    expect(host.querySelector('[aria-label="Add sheet"]')).toBeNull();
    expect(host.querySelector('[aria-label="Unhide sheet"]')).toBeNull();
    expect(host.querySelector(".sheetwrite-tab-options-button")).toBeNull();
    const buttons = tabButtons(host);
    expect(buttons.every((button) => !button.draggable)).toBe(true);
    buttons[1]!.focus();
    key(host, "F2");
    expect(host.querySelector("input")).toBeNull();
    key(host, "ArrowRight");
    expectSameNode(document.activeElement, buttons[2]!);

    tabs.setReadOnly(false);
    expect(host.querySelector('[aria-label="Add sheet"]')).not.toBeNull();
    tabButtons(host)[1]!.focus();
    key(host, "F2");
    expect(host.querySelector("input")).not.toBeNull();
    tabs.setReadOnly(true);
    expect(host.querySelector("input")).toBeNull();
    expect(actions).toEqual([]);
  });
});
