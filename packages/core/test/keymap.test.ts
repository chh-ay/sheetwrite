import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { createGrid, initSheetwrite } from "../src/grid.js";
import { createToolbar } from "../src/shell/toolbar-factory.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreCanvasStubs: () => void;
let platformDescriptor: PropertyDescriptor | undefined;
let clipboardDescriptor: PropertyDescriptor | undefined;

beforeAll(async () => {
  await initSheetwrite();
});
beforeEach(() => {
  restoreCanvasStubs = installCanvasTestStubs();
  platformDescriptor = Object.getOwnPropertyDescriptor(navigator, "platform");
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
});
afterEach(() => {
  restoreCanvasStubs();
  for (const [property, descriptor] of [
    ["platform", platformDescriptor],
    ["clipboard", clipboardDescriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(navigator, property, descriptor);
    else Reflect.deleteProperty(navigator, property);
  }
  document.body.replaceChildren();
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800 });
  Object.defineProperty(host, "clientHeight", { value: 400 });
  document.body.append(host);
  return host;
}

function requiredElement(host: HTMLElement, selector: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing grid control: ${selector}`);
  return element;
}

describe("declarative keyboard bindings", () => {
  for (const [platform, copyLabel, undoLabel, explicitLabel, pasteLabel] of [
    ["MacIntel", "⌘⇧K", "⌘U", "⌘⇧⌥L", "⌘V"],
    ["Linux x86_64", "Ctrl+Shift+K", "Ctrl+U", "Ctrl+Shift+Alt+L", "Ctrl+V"],
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
              undo: { key: "u", mod: true },
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
      const shellToolbar = createToolbar(host, grid, { items: [{ action: "undo" }] });
      try {
        const addr = { sheet: "s1", row: 0, col: 0 };
        grid.setSelection({ kind: "cell", addr });
        requiredElement(host, ".sheetwrite-scroller").dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, clientX: 80, clientY: 80 }),
        );
        expect(
          requiredElement(host, '[data-context-menu-item="copy"] .sheetwrite-context-menu-shortcut')
            .textContent,
        ).toBe(copyLabel);
        expect(
          requiredElement(
            host,
            '[data-context-menu-item="custom"] .sheetwrite-context-menu-shortcut',
          ).textContent,
        ).toBe(copyLabel);
        expect(
          requiredElement(
            host,
            '[data-context-menu-item="explicit"] .sheetwrite-context-menu-shortcut',
          ).textContent,
        ).toBe(explicitLabel);
        expect(
          requiredElement(
            host,
            '[data-context-menu-item="paste"] .sheetwrite-context-menu-shortcut',
          ).textContent,
        ).toBe(pasteLabel);
        expect(requiredElement(host, ".sheetwrite-tb-undo").title).toBe(`Undo (${undoLabel})`);
        expect(requiredElement(host, ".sheetwrite-shell-toolbar .sheetwrite-tb-undo").title).toBe(
          `Undo (${undoLabel})`,
        );
        grid.setSelection({ kind: "cell", addr });
        const mod = platform === "MacIntel" ? { metaKey: true } : { ctrlKey: true };
        const press = (key: string, shiftKey = false) =>
          host.dispatchEvent(
            new KeyboardEvent("keydown", {
              key,
              shiftKey,
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
        press("u");
        expect(grid.store.getCell(addr).resolved).toBe("Customer 0");
        grid.setConfig({
          keyboard: { bindings: { copy: null } },
          contextMenu: [{ id: "copy", action: "copy" }],
        });
        expect(grid.getShortcutLabel("copy")).toBe("");
        expect(requiredElement(host, ".sheetwrite-shell-toolbar .sheetwrite-tb-undo").title).toBe(
          platform === "MacIntel" ? "Undo (⌘Z)" : "Undo (Ctrl+Z)",
        );
        press("c");
        await Promise.resolve();
        expect(copied).toEqual(["Customer 0"]);
      } finally {
        shellToolbar.destroy();
        grid.destroy();
      }
    });
  }
});
