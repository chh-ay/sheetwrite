import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";

import { EditController } from "../src/editor.js";
import { FormulaAssist } from "../src/formula-assist.js";
import type { AssistDeps } from "../src/formula-help.js";
import { DEFAULT_THEME, initSheetwrite, SheetwriteStore } from "../src/index.js";
import type { HighlightRange } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

/** Formula help loads its chunk and the function table asynchronously. */
const LOAD_TIMEOUT_MS = 2_000;
const POLL_MS = 5;

let store: SheetwriteStore;

beforeAll(async () => {
  await initSheetwrite();
  store = new SheetwriteStore(makeWorkbook(2));
});

afterAll(() => {
  store.dispose();
});

afterEach(() => {
  document.body.innerHTML = "";
});

async function waitFor(isReady: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  while (!isReady()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(POLL_MS);
  }
}

function keydown(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
}

// The help layer goes to the field's offset parent, which is the body in tests.
function itemsOf(): string[] {
  return [...document.querySelectorAll('[role="option"]')].map((el) => el.textContent ?? "");
}

function selectedItem(): string | null {
  return document.querySelector('[role="option"][aria-selected="true"]')?.textContent ?? null;
}

function guideOf(): HTMLElement {
  const guide = document.querySelector<HTMLElement>(".sheetwrite-formula-guide");
  if (guide === null) throw new Error("no argument guide");
  return guide;
}

function deps(highlights: (HighlightRange[] | null)[] = []): AssistDeps {
  return {
    highlightCells: (ranges) => {
      highlights.push(ranges);
    },
    sheet: () => "s1",
    store,
  };
}

/** A cell editor with formula help, as the grid builds it, after `begin`. */
function beginEdit(): {
  editor: EditController;
  textarea: HTMLTextAreaElement;
  state: { cancelled: boolean; committed: string | null; highlights: (HighlightRange[] | null)[] };
} {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const state = {
    cancelled: false,
    committed: null as string | null,
    highlights: [] as (HighlightRange[] | null)[],
  };

  const editor = new EditController(host, deps(state.highlights));
  editor.begin({
    row: 0,
    col: 0,
    type: "text",
    initial: "",
    selectAll: false,
    rect: { x: 10, y: 20, w: 80, h: 24 },
    label: "Edit A, row 1",
    theme: DEFAULT_THEME,
    onCommit: (value) => {
      state.committed = value;
    },
    onCancel: () => {
      state.cancelled = true;
    },
  });

  const textarea = document.querySelector("textarea.sheetwrite-editor");
  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("editor textarea missing");
  return { editor, textarea, state };
}

function type(textarea: HTMLTextAreaElement, text: string, caret = text.length): void {
  textarea.value = text;
  textarea.setSelectionRange(caret, caret);
  textarea.dispatchEvent(new Event("input"));
}

/** Type `text` and wait until the help lists `name`. */
async function typeUntilListed(
  textarea: HTMLTextAreaElement,
  text: string,
  name: string,
): Promise<void> {
  type(textarea, text);
  await waitFor(() => itemsOf().includes(name), `${name} in the function list`);
}

describe("formula help loading", () => {
  it("loads nothing for text that is not a formula", async () => {
    const { textarea } = beginEdit();

    type(textarea, "SU");
    // Nothing signals that a load did not start, so give a wrong load time to show.
    await Bun.sleep(POLL_MS * 4);

    expect(document.querySelector(".sheetwrite-formula-help")).toBeNull();
    expect(textarea.hasAttribute("aria-autocomplete")).toBe(false);
  });

  it("lets keys through to the editor until the help has loaded", () => {
    const assist = new FormulaAssist(deps());
    expect(assist.handleKeyDown(keydown("Enter"))).toBe(false);
    expect(assist.isOpen).toBe(false);
  });
});

describe("function list", () => {
  it("lists the active engine's functions that start with the typed name", async () => {
    const { textarea } = beginEdit();

    await typeUntilListed(textarea, "=SU", "SUM");

    const names = itemsOf();
    expect(names.every((name) => name.startsWith("SU"))).toBe(true);
    // The default engine has no distribution functions.
    type(textarea, "=NORM.");
    expect(itemsOf()).toEqual([]);
  });

  it("links the field and the list as an ARIA combobox and listbox", async () => {
    const { textarea } = beginEdit();

    await typeUntilListed(textarea, "=CO", "COUNT");

    const list = document.querySelector('[role="listbox"]');
    expect(textarea.getAttribute("aria-autocomplete")).toBe("list");
    expect(textarea.getAttribute("aria-controls")).toBe(list?.id ?? "missing");
    const active = textarea.getAttribute("aria-activedescendant") ?? "";
    expect(document.querySelector(`#${active}`)?.getAttribute("aria-selected")).toBe("true");
  });

  it("moves with the arrow keys, wraps, and accepts with Enter", async () => {
    const { textarea } = beginEdit();
    await typeUntilListed(textarea, "=CO", "COUNT");
    const items = itemsOf();
    expect(items.length).toBeGreaterThan(2);

    textarea.dispatchEvent(keydown("ArrowDown"));
    expect(selectedItem()).toBe(items[1] ?? "missing");
    textarea.dispatchEvent(keydown("ArrowUp"));
    textarea.dispatchEvent(keydown("ArrowUp"));
    expect(selectedItem()).toBe(items.at(-1) ?? "missing");

    textarea.dispatchEvent(keydown("Enter"));
    expect(textarea.value).toBe(`=${items.at(-1)}(`);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("replaces the whole name at a caret inside it and keeps an existing (", async () => {
    const { textarea } = beginEdit();

    type(textarea, "=SUX(A1)", 3);
    await waitFor(() => itemsOf().includes("SUM"), "SUM in the function list");
    textarea.dispatchEvent(keydown("Tab"));

    expect(textarea.value).toBe("=SUM(A1)");
    expect(textarea.selectionStart).toBe(5);
  });

  it("closes on the first Escape and cancels the edit on the second", async () => {
    const { editor, textarea, state } = beginEdit();
    await typeUntilListed(textarea, "=SUM(A", "ABS");

    textarea.dispatchEvent(keydown("Escape"));
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(editor.isEditing).toBe(true);

    textarea.dispatchEvent(keydown("Escape"));
    expect(state.cancelled).toBe(true);
    expect(state.highlights.at(-1)).toBeNull();
  });
});

describe("argument guide", () => {
  it("shows the call at the caret with its current argument in bold, in a polite live region", async () => {
    const { textarea } = beginEdit();
    await typeUntilListed(textarea, "=ROUN", "ROUND");
    textarea.dispatchEvent(keydown("Enter"));

    type(textarea, "=ROUND(A1, ");

    const guide = guideOf();
    expect(guide.getAttribute("role")).toBe("status");
    expect(textarea.getAttribute("aria-describedby")).toBe(guide.id);
    expect(guide.querySelector(".sheetwrite-formula-signature")?.textContent).toMatch(/^ROUND\(/);
    expect(guide.querySelector("strong")?.textContent).toBe("digits");
  });

  it("shows the first error and marks the field invalid", async () => {
    const { textarea } = beginEdit();
    await typeUntilListed(textarea, "=SU", "SUM");

    type(textarea, "=SUM(1))");

    expect(guideOf().textContent).toContain("This ) has no matching (.");
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("reference colours", () => {
  it("fills each referenced range in the colour of its text, and clears on commit", async () => {
    const { editor, textarea, state } = beginEdit();
    await typeUntilListed(textarea, "=SU", "SUM");

    type(textarea, "=SUM(A1:B2)+C3+'Sheet 1'!A1:B2+Missing!A1");

    const ranges = state.highlights.at(-1) ?? [];
    expect(ranges.map(({ sheet, start, end }) => ({ sheet, start, end }))).toEqual([
      { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
      { sheet: "s1", start: { row: 2, col: 2 }, end: { row: 2, col: 2 } },
      { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
    ]);
    const [first, second, sameSheet] = ranges;
    expect(first?.color).not.toBe(second?.color);
    expect(sameSheet?.color).not.toBe(first?.color);

    const mirrored = [...document.querySelectorAll<HTMLElement>(".sheetwrite-formula-mirror span")];
    const a1b2 = mirrored.find((span) => span.textContent === "A1:B2");
    expect(first?.color?.startsWith(a1b2?.style.color ?? "missing")).toBe(true);

    editor.commit("down");
    expect(state.committed).toBe("=SUM(A1:B2)+C3+'Sheet 1'!A1:B2+Missing!A1");
    expect(state.highlights.at(-1)).toBeNull();
    expect(document.querySelector(".sheetwrite-formula-mirror")).toBeNull();
  });
});
