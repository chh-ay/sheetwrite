import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { createGrid, initSheetwrite } from "../src/grid.js";
import type { ContextMenuItem, GridConfig, KeyShortcut } from "../src/index.js";
import { createToolbar } from "../src/shell/toolbar-factory.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid } from "../src/types.js";
import { makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

let restore_canvas_stubs: () => void;
let platform_descriptor: PropertyDescriptor | undefined;
let clipboard_descriptor: PropertyDescriptor | undefined;
const cleanups: (() => void)[] = [];

beforeAll(async () => {
  await initSheetwrite();
});
beforeEach(() => {
  restore_canvas_stubs = installCanvasTestStubs();
  platform_descriptor = Object.getOwnPropertyDescriptor(navigator, "platform");
  clipboard_descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  set_platform("Linux x86_64");
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  restore_canvas_stubs();
  for (const [property, descriptor] of [
    ["platform", platform_descriptor],
    ["clipboard", clipboard_descriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(navigator, property, descriptor);
    else Reflect.deleteProperty(navigator, property);
  }
  document.body.replaceChildren();
});

function set_platform(platform: string): void {
  Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
}

function mount(config: GridConfig): { host: HTMLDivElement; grid: Grid } {
  const host = mountHost();
  const grid = createGrid(host, { workbook: makeWorkbook(3), data: makeColumnarData(3), config });
  cleanups.push(() => grid.destroy());
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
  return { host, grid };
}

/** A menu item that records its id when it runs. */
function item(runs: string[], id: string, shortcut: KeyShortcut): ContextMenuItem {
  return { id, label: id, shortcut, onClick: () => runs.push(id) };
}

function press(host: HTMLElement, key: string, modifiers: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  host.dispatchEvent(event);
  return event.defaultPrevented;
}

function required_element(host: HTMLElement, selector: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing grid control: ${selector}`);
  return element;
}

function menu_label(host: HTMLElement, id: string): string | null | undefined {
  host
    .querySelector(".sheetwrite-scroller")
    ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 80, clientY: 80 }));
  return host.querySelector(`[data-context-menu-item="${id}"] .sheetwrite-context-menu-shortcut`)
    ?.textContent;
}

describe("declarative keyboard bindings", () => {
  for (const [platform, copy_label, undo_label, explicit_label, paste_label] of [
    ["MacIntel", "⌘⇧K", "⌘J", "⌘⇧⌥L", "⌘V"],
    ["Linux x86_64", "Ctrl+Shift+K", "Ctrl+J", "Ctrl+Shift+Alt+L", "Ctrl+V"],
  ] as const) {
    it(`uses the same ${platform} binding in keys, menu hints, and toolbar titles`, async () => {
      Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
      const copied: string[] = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            copied.push(text);
          },
        },
      });
      const host = mountHost();
      const grid = createGrid(host, {
        workbook: makeWorkbook(3),
        data: makeColumnarData(3),
        config: {
          toolbar: [{ action: "undo" }],
          keyboard: {
            bindings: {
              copy: { key: "k", mod: true, shift: true },
              undo: { key: "j", mod: true },
            },
          },
          contextMenu: [
            { id: "copy", action: "copy" },
            { id: "paste", action: "paste" },
            {
              id: "custom",
              label: "Custom copy",
              shortcut: "copy",
              onClick: (instance) => {
                void instance.actions.copy();
              },
            },
            {
              id: "explicit",
              label: "Host shortcut",
              shortcut: { key: "l", mod: true, shift: true, alt: true },
            },
          ],
        },
      });
      const shell_toolbar = createToolbar(host, grid, { items: [{ action: "undo" }] });
      // The built-in toolbar loads lazily; awaiting its module runs the mount first.
      await import("../src/ribbon/command-toolbar.js");
      try {
        const addr = { sheet: "s1", row: 0, col: 0 };
        grid.setSelection({ kind: "cell", addr });
        required_element(host, ".sheetwrite-scroller").dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, clientX: 80, clientY: 80 }),
        );
        expect(
          required_element(
            host,
            '[data-context-menu-item="copy"] .sheetwrite-context-menu-shortcut',
          ).textContent,
        ).toBe(copy_label);
        expect(
          required_element(
            host,
            '[data-context-menu-item="custom"] .sheetwrite-context-menu-shortcut',
          ).textContent,
        ).toBe(copy_label);
        expect(
          required_element(
            host,
            '[data-context-menu-item="explicit"] .sheetwrite-context-menu-shortcut',
          ).textContent,
        ).toBe(explicit_label);
        expect(
          required_element(
            host,
            '[data-context-menu-item="paste"] .sheetwrite-context-menu-shortcut',
          ).textContent,
        ).toBe(paste_label);
        expect(required_element(host, '.sheetwrite-toolbar [data-command="undo"]').title).toBe(
          `Undo (${undo_label})`,
        );
        expect(
          required_element(host, '.sheetwrite-shell-toolbar [data-command="undo"]').title,
        ).toBe(`Undo (${undo_label})`);
        grid.setSelection({ kind: "cell", addr });
        const mod = platform === "MacIntel" ? { metaKey: true } : { ctrlKey: true };
        const press = (key: string, shift_key = false) =>
          host.dispatchEvent(
            new KeyboardEvent("keydown", {
              key,
              shiftKey: shift_key,
              ...mod,
              bubbles: true,
              cancelable: true,
            }),
          );
        press("c");
        await Promise.resolve();
        expect(copied).toEqual([]);
        press("k", true);
        await Promise.resolve();
        expect(copied).toEqual(["Customer 0"]);
        grid.applyTransaction({
          patches: [{ op: "set", addr, value: { kind: "literal", value: "Changed" } }],
        });
        press("j");
        expect(grid.store.getCell(addr).resolved).toBe("Customer 0");
        grid.setConfig({
          keyboard: { bindings: { copy: null } },
          contextMenu: [{ id: "copy", action: "copy" }],
        });
        expect(grid.getShortcutLabel("copy")).toBe("");
        expect(
          required_element(host, '.sheetwrite-shell-toolbar [data-command="undo"]').title,
        ).toBe(platform === "MacIntel" ? "Undo (⌘Z)" : "Undo (Ctrl+Z)");
        press("c");
        await Promise.resolve();
        expect(copied).toEqual(["Customer 0"]);
      } finally {
        shell_toolbar.destroy();
        grid.destroy();
      }
    });
  }
});

describe("custom key combinations", () => {
  for (const [platform, mod, label] of [
    ["MacIntel", { metaKey: true }, "⌘⇧J"],
    ["Linux x86_64", { ctrlKey: true }, "Ctrl+Shift+J"],
  ] as const) {
    it(`runs a menu item's onClick from its ${platform} combination, in string or object form`, () => {
      set_platform(platform);
      for (const shortcut of ["Mod+Shift+J", { key: "j", mod: true, shift: true }] as const) {
        const runs: string[] = [];
        const { host, grid } = mount({
          contextMenu: [
            {
              id: "jump",
              label: "Jump",
              shortcut,
              onClick: (_grid, cell) => runs.push(`${cell?.row}:${cell?.col}`),
            },
          ],
        });
        grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 2 } });
        expect(press(host, "j", mod)).toBe(false);
        expect(press(host, "J", { ...mod, shiftKey: true })).toBe(true);
        // onClick gets the active cell.
        expect(runs).toEqual(["1:2"]);
        expect(menu_label(host, "jump")).toBe(label);
      }
    });
  }

  it("reports a combination bound twice, and keeps the working configuration", () => {
    const conflicting = {
      contextMenu: [{ id: "steal", label: "Steal copy", shortcut: "Ctrl+C", onClick: () => {} }],
    } as const;
    expect(() => mount(conflicting)).toThrow(
      expect.objectContaining({ code: "shortcut-conflict" }),
    );

    const runs: string[] = [];
    const { host, grid } = mount({ contextMenu: [item(runs, "jump", "Mod+J")] });
    expect(() => grid.setConfig(conflicting)).toThrow(
      expect.objectContaining({ code: "shortcut-conflict" }),
    );
    press(host, "j", { ctrlKey: true });
    expect(runs).toEqual(["jump"]);
  });

  it("runs Shift combinations by the shifted character, and letters by meaning on other layouts", () => {
    const runs: string[] = [];
    const { host } = mount({
      contextMenu: [
        item(runs, "letter", "Mod+Shift+K"),
        // Ctrl+Shift+1 to 6 are Excel's number-format keys; 8 is free.
        item(runs, "digit", "Ctrl+Shift+8"),
        item(runs, "symbol", "Mod+Shift+/"),
        item(runs, "alt", "Mod+Alt+L"),
        item(runs, "a", "Mod+Shift+A"),
        item(runs, "q", "Mod+Shift+Q"),
      ],
    });
    // With Shift held, the browser reports the shifted character in `key`.
    press(host, "K", { ctrlKey: true, shiftKey: true, code: "KeyK" });
    press(host, "*", { ctrlKey: true, shiftKey: true, code: "Digit8" });
    press(host, "?", { ctrlKey: true, shiftKey: true, code: "Slash" });
    press(host, "¬", { ctrlKey: true, altKey: true, code: "KeyL" });
    // A plain "8" without Shift must not run the Shift+8 command.
    press(host, "8", { ctrlKey: true, code: "Digit8" });
    // AZERTY: A is on the Q key, and it is A.
    press(host, "A", { ctrlKey: true, shiftKey: true, code: "KeyQ" });
    expect(runs).toEqual(["letter", "digit", "symbol", "alt", "a"]);
  });

  it.each(["Mod+", "Hyper+K", "Shift+Shift+K", "Ctrl+Alt"])(
    "rejects the malformed combination %p from untyped callers",
    (shortcut) => {
      // The type already rejects "Hyper+K"; JavaScript callers still reach the parser.
      let error: unknown;
      try {
        mount({ contextMenu: [item([], "bad", shortcut as unknown as KeyShortcut)] });
      } catch (caught) {
        error = caught;
      }
      expect((error as { code?: string } | undefined)?.code).toBe("invalid-shortcut");
    },
  );
});
