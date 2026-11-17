import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { createGridController } from "../src/grid-controller.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { GridConfig, KeyboardOptions, Workbook } from "../src/types.js";

// The Keyboard shortcuts panel (#802): the user rebinds the grid's built-in
// commands. Each change applies at once and reaches the host as one
// `key-bindings-change` event, which it stores and passes back through
// `config.keyboard.bindings`.

type Bindings = NonNullable<KeyboardOptions["bindings"]>;

const PANEL_MODULE = "../src/keyboard-settings.js";
const RIBBON_MODULE = "../src/ribbon/ribbon.js";
const CHROME_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

let restore: () => void;
const grids: GridImpl[] = [];
const saved = new Map<string, PropertyDescriptor | undefined>();

function setNavigator(platform: string, userAgent: string): void {
  Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: userAgent });
}

beforeAll(async () => {
  await initSheetwrite();
  await import(RIBBON_MODULE);
});
beforeEach(() => {
  restore = installCanvasTestStubs();
  for (const property of ["platform", "userAgent"]) {
    saved.set(property, Object.getOwnPropertyDescriptor(navigator, property));
  }
  setNavigator("Linux x86_64", CHROME_LINUX);
});
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  document.body.replaceChildren();
  restore();
  for (const [property, descriptor] of saved) {
    if (descriptor) Object.defineProperty(navigator, property, descriptor);
    else Reflect.deleteProperty(navigator, property);
  }
});

function setup(config: GridConfig = { keyboardSettings: true }) {
  const workbook: Workbook = {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet",
        rowCount: 3,
        columns: [{ key: "a", header: "A", type: "text", width: 100 }],
      },
    ],
  };
  const store = new SheetwriteStore(workbook, { rowCount: 3, columns: { a: ["x", "y", "z"] } });
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 900 }, clientHeight: { value: 500 } });
  document.body.append(host);
  const grid = new GridImpl(host, { workbook, config }, store);
  grids.push(grid);
  const events: Bindings[] = [];
  grid.on("key-bindings-change", ({ bindings }) => events.push(bindings));
  grid.setSelection({ kind: "cell", addr: { sheet: "s1", row: 0, col: 0 } });
  return { grid, host, store, events };
}

/** Open the panel and wait for its lazy chunk; returns the dialog. */
async function open(grid: GridImpl, host: HTMLElement): Promise<HTMLElement> {
  grid.openKeyboardSettings();
  await import(PANEL_MODULE);
  await Promise.resolve();
  return dialog(host);
}

function dialog(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>(".sheetwrite-keyboard-settings");
  if (element === null) throw new Error("the Keyboard shortcuts panel is not open");
  return element;
}

function byLabel<T extends HTMLElement = HTMLButtonElement>(root: HTMLElement, label: string): T {
  const element = root.querySelector<T>(`[aria-label="${label}"]`);
  if (element === null) throw new Error(`no control labelled "${label}"`);
  return element;
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent === text && !candidate.closest("[hidden]"),
  );
  if (found === undefined) throw new Error(`no button "${text}"`);
  return found;
}

function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function status(panel: HTMLElement): string {
  return panel.querySelector('[role="status"]')?.textContent ?? "";
}

function shownCommands(panel: HTMLElement): string[] {
  return [...panel.querySelectorAll<HTMLElement>("tr[data-action]")]
    .filter((row) => !row.hidden)
    .map((row) => row.dataset.action ?? "");
}

/** Change the first keys of `label` to the keys `init` presses. */
function record(panel: HTMLElement, change: string, key: string, init: KeyboardEventInit) {
  const field = byLabel(panel, change);
  field.click();
  return press(field, key, init);
}

describe("opening the panel", () => {
  it("shows no entry and opens nothing unless the host turns the panel on", async () => {
    const { grid, host } = setup({ ribbon: { mode: "compact" } });
    await import(RIBBON_MODULE);
    expect(host.querySelector('[data-command="keyboardShortcuts"]')).toBeNull();
    expect(host.querySelector(".sheetwrite-ribbon-settings")).toBeNull();
    grid.openKeyboardSettings();
    await import(PANEL_MODULE);
    await Promise.resolve();
    expect(host.querySelector(".sheetwrite-keyboard-settings")).toBeNull();
  });

  it("is a labelled dialog that lists each command with its keys and Excel's default", async () => {
    const { grid, host } = setup();
    const panel = await open(grid, host);

    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    const title = host.querySelector(`#${panel.getAttribute("aria-labelledby")}`);
    expect(title?.textContent).toBe("Keyboard shortcuts");
    expect(shownCommands(panel)).toHaveLength(34);
    const bold = panel.querySelector<HTMLElement>('tr[data-action="bold"]')!;
    expect(bold.querySelector("th")?.textContent).toBe("Bold");
    expect(bold.querySelector("[data-default]")?.textContent).toBe("Ctrl+B, Ctrl+2");
    expect(byLabel(panel, "Change Ctrl+B for Bold").textContent).toBe("Ctrl+B");
    // The search box has focus, so typing searches at once.
    expect(document.activeElement).toBe(byLabel(panel, "Search commands or press keys"));
  });
});

describe("recording keys", () => {
  it("announces recording, applies the new keys at once and emits one change", async () => {
    const { grid, host, events } = setup();
    const panel = await open(grid, host);

    const field = byLabel(panel, "Change Ctrl+B for Bold");
    field.click();
    expect(status(panel)).toBe("Recording keys for Bold. Press the new keys, or Escape to cancel.");
    // A modifier alone only shows what is held so far.
    press(document.activeElement as HTMLElement, "Control", { ctrlKey: true });
    expect(events).toEqual([]);
    const event = press(document.activeElement as HTMLElement, "B", {
      ctrlKey: true,
      shiftKey: true,
      code: "KeyB",
    });

    expect(event.defaultPrevented).toBe(true);
    expect(events).toEqual([{ bold: ["Mod+Shift+B", "Mod+2"] }]);
    expect(grid.getShortcutLabel("bold")).toBe("Ctrl+Shift+B");
    expect(byLabel(panel, "Change Ctrl+Shift+B for Bold").textContent).toBe("Ctrl+Shift+B");
    expect(status(panel)).toContain("Bold now uses Ctrl+Shift+B, Ctrl+2.");
    // Excel's default stays beside it.
    expect(panel.querySelector('tr[data-action="bold"] [data-default]')?.textContent).toBe(
      "Ctrl+B, Ctrl+2",
    );
  });

  it("Escape leaves recording; a second Escape closes and returns focus to the opener", async () => {
    const { grid, host, events } = setup();
    const opener = document.createElement("button");
    host.append(opener);
    opener.focus();
    const panel = await open(grid, host);

    byLabel(panel, "Change Ctrl+I for Italic").click();
    press(document.activeElement as HTMLElement, "Escape");
    expect(status(panel)).toBe("Stopped recording. Italic keeps Ctrl+I, Ctrl+3.");
    expect(host.querySelector(".sheetwrite-keyboard-settings")).not.toBeNull();
    expect(document.activeElement).toBe(byLabel(panel, "Change Ctrl+I for Italic"));

    press(document.activeElement as HTMLElement, "Escape");
    expect(host.querySelector(".sheetwrite-keyboard-settings")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(events).toEqual([]);
  });

  it("refuses keys that would type or move, and keys the browser keeps, with the reason", async () => {
    const { grid, host, events } = setup();
    const panel = await open(grid, host);

    record(panel, "Change Ctrl+B for Bold", "b", { code: "KeyB" });
    expect(status(panel)).toBe("Add Ctrl or Alt: without them, keys type into the cell.");
    press(document.activeElement as HTMLElement, "ArrowRight", { ctrlKey: true });
    expect(status(panel)).toBe(
      "Ctrl+ArrowRight moves or edits in the sheet, as in Excel, so it can't be assigned.",
    );
    press(document.activeElement as HTMLElement, "t", { ctrlKey: true, code: "KeyT" });
    expect(status(panel)).toBe(
      "Chrome and Edge use Ctrl+T to open a new tab, so the page never receives it.",
    );
    expect(events).toEqual([]);
    // Still recording: the next keys are taken.
    press(document.activeElement as HTMLElement, "k", {
      ctrlKey: true,
      altKey: true,
      code: "KeyK",
    });
    expect(events).toEqual([{ bold: ["Mod+Alt+K", "Mod+2"] }]);
  });

  it("refuses macOS's screenshot keys in Safari", async () => {
    setNavigator("MacIntel", SAFARI_MAC);
    const { grid, host, events } = setup();
    const panel = await open(grid, host);

    record(panel, "Change ⌘B for Bold", "#", { metaKey: true, shiftKey: true, code: "Digit3" });
    expect(status(panel)).toBe(
      "macOS uses ⌘⇧3 to take a screenshot, so the page never receives it.",
    );
    expect(events).toEqual([]);
    // Excel's Ctrl+Shift+3 stays the Date default; the row warns that it never arrives here.
    expect(
      panel.querySelector('tr[data-action="formatDate"] .sheetwrite-keys-warning')?.textContent,
    ).toBe("macOS uses ⌘⇧3 to take a screenshot, so the page never receives it.");
  });
});

describe("conflicts", () => {
  it("names the other command and swaps the keys between the two as one change", async () => {
    const { grid, host, events } = setup();
    const panel = await open(grid, host);

    record(panel, "Change Ctrl+B for Bold", "i", { ctrlKey: true, code: "KeyI" });
    const prompt = panel.querySelector<HTMLElement>(".sheetwrite-keys-conflict")!;
    expect(prompt.hidden).toBe(false);
    expect(prompt.textContent).toContain("Ctrl+I is assigned to Italic.");
    expect(document.activeElement).toBe(button(prompt, "Swap"));
    expect(events).toEqual([]);

    button(prompt, "Swap").click();
    expect(events).toEqual([{ bold: ["Mod+I", "Mod+2"], italic: ["Mod+B", "Mod+3"] }]);
    expect(grid.getShortcutLabel("italic")).toBe("Ctrl+B");
    expect(prompt.hidden).toBe(true);
  });

  it("replaces the other command's keys, or cancels without a change", async () => {
    const { grid, host, events } = setup();
    const panel = await open(grid, host);
    const prompt = panel.querySelector<HTMLElement>(".sheetwrite-keys-conflict")!;

    record(panel, "Change Ctrl+B for Bold", "u", { ctrlKey: true, code: "KeyU" });
    button(prompt, "Cancel").click();
    expect(events).toEqual([]);
    expect(grid.getShortcutLabel("bold")).toBe("Ctrl+B");

    record(panel, "Change Ctrl+B for Bold", "u", { ctrlKey: true, code: "KeyU" });
    button(prompt, "Replace").click();
    expect(events).toEqual([{ bold: ["Mod+U", "Mod+2"], underline: ["Mod+4"] }]);
  });

  it("shows a locked command read-only and never changes it through a conflict", async () => {
    const { grid, host, events } = setup({ keyboardSettings: { locked: ["italic"] } });
    const panel = await open(grid, host);

    const italic = panel.querySelector<HTMLElement>('tr[data-action="italic"]')!;
    expect(italic.querySelector("button")).toBeNull();
    expect(italic.textContent).toContain("Set by your app");

    record(panel, "Change Ctrl+B for Bold", "i", { ctrlKey: true, code: "KeyI" });
    const prompt = panel.querySelector<HTMLElement>(".sheetwrite-keys-conflict")!;
    expect(prompt.textContent).toContain(
      "Ctrl+I is assigned to Italic, which your app keeps fixed.",
    );
    expect([...prompt.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Cancel"]);
    expect(events).toEqual([]);
  });
});

describe("undo, reset, import and export", () => {
  it("undoes a change from the toast, and resets one command or all of them", async () => {
    const { grid, host, events } = setup({
      keyboardSettings: true,
      keyboard: { bindings: { copy: "Mod+Shift+C", paste: "Mod+Shift+P" } },
    });
    const panel = await open(grid, host);

    record(panel, "Change Ctrl+B for Bold", "j", { ctrlKey: true, code: "KeyJ" });
    button(panel, "Undo").click();
    expect(events.at(-1)).toEqual({ copy: ["Mod+Shift+C"], paste: ["Mod+Shift+P"] });
    expect(grid.getShortcutLabel("bold")).toBe("Ctrl+B");

    byLabel(panel, "Reset Copy").click();
    expect(events.at(-1)).toEqual({ paste: ["Mod+Shift+P"] });
    expect(grid.getShortcutLabel("copy")).toBe("Ctrl+C");

    button(panel, "Reset all").click();
    expect(events.at(-1)).toEqual({});
    expect(grid.getShortcutLabel("paste")).toBe("Ctrl+V");
    expect(events).toHaveLength(4);
  });

  it("imports bindings as one change and refuses files it cannot use", async () => {
    const { grid, host, events } = setup();
    const panel = await open(grid, host);
    const input = panel.querySelector<HTMLInputElement>('input[type="file"]')!;
    const load = async (text: string) => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File([text], "keys.json", { type: "application/json" })],
      });
      input.dispatchEvent(new Event("change"));
      for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
    };

    await load('{"bindings":{"bold":"Mod+W"}}');
    expect(status(panel)).toBe(
      "Bold: Chrome and Edge use Ctrl+W to close the tab, so the page never receives it.",
    );
    await load('{"bindings":{"bold":"Mod+I"}}');
    expect(status(panel)).toBe("Ctrl+I is assigned to both Bold and Italic.");
    await load('{"bindings":{"boldface":"Mod+J"}}');
    expect(status(panel)).toBe("“boldface” is not a command.");
    expect(events).toEqual([]);

    await load(
      '{"sheetwrite":"keyboard-shortcuts","version":1,"bindings":{"bold":["Mod+J"],"find":null}}',
    );
    expect(events).toEqual([{ bold: ["Mod+J"], find: null }]);
    expect(grid.getShortcutLabel("find")).toBe("");
  });

  it("exports the changed bindings as JSON that imports back", async () => {
    const { exportBindings, importBindings } = await import("../src/keyboard-settings-model.js");
    const bindings: Bindings = { bold: ["Mod+J"], find: null };
    const text = exportBindings(bindings);
    expect(JSON.parse(text)).toEqual({ sheetwrite: "keyboard-shortcuts", version: 1, bindings });
    expect(importBindings(text, {}, new Set())).toEqual({ bindings });
  });
});

describe("finding commands", () => {
  it("searches names and keys, finds the owner of pressed keys, and shows changed only", async () => {
    const { grid, host } = setup({
      keyboardSettings: true,
      keyboard: { bindings: { copy: "Mod+Shift+C" } },
    });
    const panel = await open(grid, host);
    const search = byLabel<HTMLInputElement>(panel, "Search commands or press keys");
    const type = (text: string) => {
      search.value = text;
      search.dispatchEvent(new Event("input", { bubbles: true }));
    };

    type("fill");
    expect(shownCommands(panel)).toEqual(["fillDown", "fillRight"]);
    type("ctrl+shift+l");
    expect(shownCommands(panel)).toEqual(["toggleFilter"]);

    // Pressing keys in the box finds the command that owns them.
    const event = press(search, "L", { ctrlKey: true, shiftKey: true, code: "KeyL" });
    expect(event.defaultPrevented).toBe(true);
    expect(search.value).toBe("Ctrl+Shift+L");
    expect(shownCommands(panel)).toEqual(["toggleFilter"]);
    // Ctrl+A still selects the search text.
    expect(press(search, "a", { ctrlKey: true, code: "KeyA" }).defaultPrevented).toBe(false);

    type("");
    byLabel<HTMLInputElement>(panel, "Show changed only").click();
    expect(shownCommands(panel)).toEqual(["copy"]);
  });
});

describe("where the panel opens", () => {
  it("opens from File › Options in the full ribbon and from the gear in the compact ribbon", async () => {
    for (const mode of ["full", "compact"] as const) {
      const { host } = setup({ keyboardSettings: true, ribbon: { mode } });
      await import(RIBBON_MODULE);
      const gear = host.querySelector<HTMLButtonElement>(".sheetwrite-ribbon-settings")!;
      expect(gear.hidden).toBe(mode === "full");
      if (mode === "full") {
        [...host.querySelectorAll<HTMLElement>('.sheetwrite-ribbon [role="tab"]')]
          .find((tab) => tab.textContent === "File")!
          .click();
      }
      const entry =
        mode === "full"
          ? host.querySelector<HTMLButtonElement>(
              '.sheetwrite-ribbon-panel [data-command="keyboardShortcuts"]',
            )
          : gear;
      expect(entry).not.toBeNull();
      expect(entry!.hidden).toBe(false);
      entry!.click();
      await import(PANEL_MODULE);
      await Promise.resolve();
      expect(dialog(host)).not.toBeNull();
      host.remove();
    }
  });

  it("reaches framework adapters as onKeyBindingsChange", async () => {
    const host = document.createElement("div");
    Object.defineProperties(host, { clientWidth: { value: 900 }, clientHeight: { value: 500 } });
    document.body.append(host);
    const received: Bindings[] = [];
    const controller = createGridController(
      host,
      {
        workbook: {
          activeSheet: "s1",
          sheets: [
            {
              id: "s1",
              name: "Sheet",
              rowCount: 1,
              columns: [{ key: "a", header: "A", type: "text", width: 80 }],
            },
          ],
        },
        config: { keyboardSettings: true },
      },
      { onKeyBindingsChange: ({ bindings }) => received.push(bindings) },
    );
    try {
      const panel = await open(controller.grid as GridImpl, host);
      record(panel, "Change Ctrl+B for Bold", "j", { ctrlKey: true, code: "KeyJ" });
      expect(received).toEqual([{ bold: ["Mod+J", "Mod+2"] }]);
    } finally {
      controller.destroy();
    }
  });
});
