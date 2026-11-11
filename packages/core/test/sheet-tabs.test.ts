import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { type SheetTabRecord, SheetTabs, type SheetTabsOptions } from "../src/sheet-tabs.js";
import type { SheetLifecycleResult } from "../src/types/grid.js";
import { pressLikeWebKit } from "./fixtures.js";

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

function tabButtons(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function key(target: EventTarget, value: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, ...init }));
}

describe("SheetTabs", () => {
  let host: HTMLDivElement;
  let tabs: SheetTabs;
  let activated: string[];
  let scrolled: string[];
  let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView | undefined;

  beforeEach(() => {
    document.body.replaceChildren();
    host = document.createElement("div");
    host.style.width = "390px";
    host.style.overflowX = "auto";
    document.body.appendChild(host);
    activated = [];
    scrolled = [];
    originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value(this: HTMLElement) {
        scrolled.push(this.dataset.sheetId ?? this.getAttribute("aria-label") ?? "unknown");
      },
    });
    tabs = new SheetTabs(host, { onActivate: (id) => activated.push(id) });
    tabs.update(SHEETS, "b");
  });

  afterEach(() => {
    tabs.destroy();
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
    document.body.replaceChildren();
  });

  it("does not remove the last visible sheet or remove a tab with Backspace", () => {
    tabs.destroy();
    const removed: string[] = [];
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onRemove: (id) => {
        removed.push(id);
        return applied(id);
      },
    });
    tabs.update([{ id: "a", name: "Only" }], "a");
    tabButtons(host)[0]?.focus();
    key(host, "Delete");
    expect(removed).toEqual([]);

    tabs.update(SHEETS, "a");
    tabButtons(host)[0]?.focus();
    key(host, "Backspace");
    expect(removed).toEqual([]);
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
    tabs.destroy();
    tabs = new SheetTabs(host, options);
    const workbook = [
      ...SHEETS,
      { id: "hidden", name: "Hidden", visibility: "hidden" as const },
      { id: "secret", name: "Secret", visibility: "veryHidden" as const },
    ];
    tabs.update(workbook, "b");

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
    expect(document.activeElement).toBe(items[0]!);
    key(items[0]!, "End");
    expect(document.activeElement).toBe(items.at(-1)!);
    key(items.at(-1)!, "Home");
    expect(document.activeElement).toBe(items[0]!);
    key(items[0]!, "Escape");
    trigger = host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!;
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

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
    expect(document.activeElement).toBe(unhide);
    unhide.click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(unhide.getAttribute("aria-expanded")).toBe("false");
    expect(hiddenChoices.hidden).toBe(true);
    expect(document.activeElement).toBe(unhide);
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
    tabs.destroy();
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onHide: (id) => {
        actions.push(`hide:${id}`);
        return applied(id);
      },
      onUnhide: (id) => {
        actions.push(`unhide:${id}`);
        return applied(id);
      },
    });
    tabs.update([...SHEETS, { id: "hidden", name: "Hidden", visibility: "hidden" }], "b");

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
    tabs.destroy();
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onMove: (id, to) => {
        moves.push(`${id}:${to}`);
        return applied(id);
      },
    });
    tabs.update(
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

  it("suppresses mutation affordances in read-only mode while preserving navigation", () => {
    const actions: string[] = [];
    tabs.destroy();
    tabs = new SheetTabs(host, {
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
    });
    tabs.update([...SHEETS, { id: "hidden", name: "Hidden", visibility: "hidden" }], "b");
    expect(host.querySelector('[aria-label="Add sheet"]')).toBeNull();
    expect(host.querySelector('[aria-label="Unhide sheet"]')).toBeNull();
    expect(host.querySelector(".sheetwrite-tab-options-button")).toBeNull();
    const buttons = tabButtons(host);
    expect(buttons.every((button) => !button.draggable)).toBe(true);
    buttons[1]!.focus();
    key(host, "F2");
    expect(host.querySelector("input")).toBeNull();
    key(host, "ArrowRight");
    expect(document.activeElement).toBe(buttons[2]!);

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
