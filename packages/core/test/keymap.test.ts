import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { createGrid, initSheetwrite } from "../src/grid.js";
import type { KeyShortcut } from "../src/index.js";
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

function setPlatform(platform: string): void {
  Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
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

function openMenuLabel(host: HTMLElement, id: string): string | null {
  requiredElement(host, ".sheetwrite-scroller").dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, clientX: 80, clientY: 80 }),
  );
  return requiredElement(host, `[data-context-menu-item="${id}"] .sheetwrite-context-menu-shortcut`)
    .textContent;
}

describe("custom key combinations", () => {
  for (const [platform, mod, label] of [
    ["MacIntel", { metaKey: true }, "⌘⇧J"],
    ["Linux x86_64", { ctrlKey: true }, "Ctrl+Shift+J"],
  ] as const) {
    it(`runs a menu item's onClick from its ${platform} combination, in string or object form`, () => {
      setPlatform(platform);
      for (const shortcut of ["Mod+Shift+J", { key: "j", mod: true, shift: true }] as const) {
        const host = mountHost();
        const runs: string[] = [];
        const grid = createGrid(host, {
          workbook: makeWorkbook(3),
          data: makeColumnarData(3),
          config: {
            contextMenu: [
              {
                id: "jump",
                label: "Jump",
                shortcut,
                onClick: (_grid, cell) => runs.push(`${cell?.row}:${cell?.col}`),
              },
            ],
          },
        });
        try {
          grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 2 } });
          expect(press(host, "j", mod)).toBe(false);
          expect(press(host, "J", { ...mod, shiftKey: true })).toBe(true);
          expect(runs).toEqual(["1:2"]);
          expect(openMenuLabel(host, "jump")).toBe(label);
        } finally {
          grid.destroy();
          host.remove();
        }
      }
    });
  }

  it("binds a literal Control combination on macOS without taking Command", () => {
    setPlatform("MacIntel");
    const host = mountHost();
    let runs = 0;
    const grid = createGrid(host, {
      workbook: makeWorkbook(3),
      data: makeColumnarData(3),
      config: {
        contextMenu: [
          { id: "ctrl", label: "Control J", shortcut: "Ctrl+J", onClick: () => runs++ },
        ],
      },
    });
    try {
      grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
      press(host, "j", { metaKey: true });
      expect(runs).toBe(0);
      press(host, "j", { ctrlKey: true });
      expect(runs).toBe(1);
      expect(openMenuLabel(host, "ctrl")).toBe("⌃J");
    } finally {
      grid.destroy();
    }
  });

  it("runs a Mod combination from Control or Command on any reported platform", () => {
    // WebKit test runners report a Mac platform on Linux, where users press Control.
    setPlatform("MacIntel");
    const host = mountHost();
    let runs = 0;
    const grid = createGrid(host, {
      workbook: makeWorkbook(3),
      data: makeColumnarData(3),
      config: {
        contextMenu: [{ id: "jump", label: "Jump", shortcut: "Mod+J", onClick: () => runs++ }],
      },
    });
    try {
      grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
      press(host, "j", { metaKey: true });
      press(host, "j", { ctrlKey: true });
      press(host, "j", { ctrlKey: true, metaKey: true });
      expect(runs).toBe(2);
      expect(openMenuLabel(host, "jump")).toBe("⌘J");
    } finally {
      grid.destroy();
    }
  });

  it("does not run a disabled item", () => {
    setPlatform("Linux x86_64");
    const host = mountHost();
    let runs = 0;
    const grid = createGrid(host, {
      workbook: makeWorkbook(3),
      data: makeColumnarData(3),
      config: {
        contextMenu: [
          { id: "off", label: "Off", shortcut: "Mod+J", disabled: true, onClick: () => runs++ },
        ],
      },
    });
    try {
      grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
      press(host, "j", { ctrlKey: true });
      expect(runs).toBe(0);
    } finally {
      grid.destroy();
    }
  });

  it("reports a combination bound twice, and keeps the working configuration", () => {
    setPlatform("Linux x86_64");
    const conflicting = {
      contextMenu: [{ id: "steal", label: "Steal copy", shortcut: "Ctrl+C", onClick: () => {} }],
    } as const;
    expect(() =>
      createGrid(mountHost(), {
        workbook: makeWorkbook(3),
        data: makeColumnarData(3),
        config: conflicting,
      }),
    ).toThrow(expect.objectContaining({ code: "shortcut-conflict" }));

    const host = mountHost();
    let runs = 0;
    const grid = createGrid(host, {
      workbook: makeWorkbook(3),
      data: makeColumnarData(3),
      config: {
        contextMenu: [{ id: "jump", label: "Jump", shortcut: "Mod+J", onClick: () => runs++ }],
      },
    });
    try {
      expect(() => grid.setConfig(conflicting)).toThrow(
        expect.objectContaining({ code: "shortcut-conflict" }),
      );
      grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
      press(host, "j", { ctrlKey: true });
      expect(runs).toBe(1);
    } finally {
      grid.destroy();
    }
  });

  it("runs a modified combination from the inline editor, but not a bare key", () => {
    setPlatform("Linux x86_64");
    const host = mountHost();
    const runs: string[] = [];
    const grid = createGrid(host, {
      workbook: makeWorkbook(3),
      data: makeColumnarData(3),
      config: {
        contextMenu: [
          { id: "mod", label: "Mod", shortcut: "Mod+J", onClick: () => runs.push("mod") },
          { id: "bare", label: "Bare", shortcut: { key: "F7" }, onClick: () => runs.push("bare") },
        ],
      },
    });
    try {
      grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
      grid.beginEdit(0, 0);
      const editor = requiredElement(host, "textarea.sheetwrite-editor");
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "F7", bubbles: true }));
      editor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true }),
      );
      expect(runs).toEqual(["mod"]);
    } finally {
      grid.destroy();
    }
  });

  it("rejects malformed combinations from untyped callers", () => {
    // The type already rejects "Hyper+K"; JavaScript callers still reach the parser.
    const malformed = ["Mod+", "Hyper+K", "Shift+Shift+K", "Ctrl+Alt"] as unknown as KeyShortcut[];
    for (const shortcut of malformed) {
      expect(() =>
        createGrid(mountHost(), {
          workbook: makeWorkbook(3),
          data: makeColumnarData(3),
          config: { contextMenu: [{ id: "bad", label: "Bad", shortcut, onClick: () => {} }] },
        }),
      ).toThrow(expect.objectContaining({ code: "invalid-shortcut" }));
    }
  });
});
