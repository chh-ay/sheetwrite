import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "bun:test";

import { DEFAULT_THEME, GridImpl, initSheetwrite } from "../src/grid.js";
import { NOTE_HOVER_DELAY_MS } from "../src/note-popover.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellAddress } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

const NOTED: CellAddress = { sheet: "s1", row: 2, col: 1 };

let restoreStubs: () => void;
let grid: GridImpl | null = null;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
  jest.useFakeTimers();
});

afterEach(() => {
  grid?.destroy();
  grid = null;
  jest.useRealTimers();
  restoreStubs();
});

function mount(options: { readOnly?: boolean } = {}): { host: HTMLDivElement; grid: GridImpl } {
  const workbook = makeWorkbook(10);
  const store = new SheetwriteStore(workbook, makeColumnarData(10));
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  grid = new GridImpl(host, { workbook }, store);
  grid.setNote(NOTED, "Check the totals");
  if (options.readOnly) grid.setReadOnly(true);
  return { host, grid };
}

function scrollerOf(host: HTMLElement): HTMLDivElement {
  const node = host.querySelector(".sheetwrite-scroller");
  if (!(node instanceof HTMLDivElement)) throw new Error("expected grid scroller");
  return node;
}

/** Client point at the center of a cell; the test viewport starts at (0, 0). */
function cellPoint(addr: CellAddress) {
  const workbook = makeWorkbook(10);
  const columns = workbook.sheets[0]?.columns ?? [];
  let x = DEFAULT_THEME.rowHeaderWidth;
  for (let c = 0; c < addr.col; c++) x += columns[c]?.width ?? 0;
  x += (columns[addr.col]?.width ?? 0) / 2;
  const y =
    DEFAULT_THEME.headerHeight + addr.row * DEFAULT_THEME.rowHeight + DEFAULT_THEME.rowHeight / 2;
  return { clientX: x, clientY: y };
}

function hover(host: HTMLElement, addr: CellAddress): void {
  scrollerOf(host).dispatchEvent(
    new PointerEvent("pointermove", { ...cellPoint(addr), pointerType: "mouse", bubbles: true }),
  );
}

function noteCard(host: HTMLElement): HTMLElement | null {
  return host.querySelector<HTMLElement>(".sheetwrite-note");
}

function noteEditor(host: HTMLElement): HTMLTextAreaElement {
  const editor = host.querySelector(".sheetwrite-note-editor");
  if (!(editor instanceof HTMLTextAreaElement)) throw new Error("expected the note editor");
  return editor;
}

function openEditor(target: GridImpl, addr: CellAddress): void {
  target.setSelection({ kind: "cell", addr });
  target.actions.editNote();
}

function press(target: EventTarget, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

describe("note hover card", () => {
  it("shows the note of the cell under the pointer only after the hover delay", () => {
    const { host } = mount();
    const focused = document.activeElement;

    hover(host, NOTED);
    jest.advanceTimersByTime(NOTE_HOVER_DELAY_MS - 1);
    expect(noteCard(host)).toBeNull();

    jest.advanceTimersByTime(1);
    const card = noteCard(host);
    expect(card?.textContent).toBe("Check the totals");
    expect(card?.getAttribute("role")).toBe("tooltip");
    expect(document.activeElement).toBe(focused);
  });

  it.each([
    [
      "the pointer leaves the grid",
      (host: HTMLElement) => {
        scrollerOf(host).dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
      },
    ],
    [
      "the grid scrolls",
      (host: HTMLElement) => {
        scrollerOf(host).dispatchEvent(new Event("scroll"));
      },
    ],
    ["the zoom changes", (_host: HTMLElement, target: GridImpl) => target.setZoom(1.5)],
  ] as const)("hides the shown note when %s", (_name, dismiss) => {
    const { host, grid: target } = mount();
    hover(host, NOTED);
    jest.advanceTimersByTime(NOTE_HOVER_DELAY_MS);
    expect(noteCard(host)).not.toBeNull();

    dismiss(host, target);

    expect(noteCard(host)).toBeNull();
  });
});

describe("note editor", () => {
  it("commits the typed text with Ctrl+Enter as one undoable step", () => {
    const { host, grid: target } = mount();

    openEditor(target, NOTED);
    const editor = noteEditor(host);
    expect(document.activeElement).toBe(editor);
    expect(editor.value).toBe("Check the totals");

    editor.value = "Totals checked";
    press(editor, { key: "Enter", ctrlKey: true });

    expect(target.getNote(NOTED)).toBe("Totals checked");
    expect(host.querySelector(".sheetwrite-note-editor")).toBeNull();
    expect(document.activeElement).toBe(host);

    target.undo();
    expect(target.getNote(NOTED)).toBe("Check the totals");
  });

  it("deletes the note when the committed text is empty", () => {
    const { host, grid: target } = mount();

    openEditor(target, NOTED);
    const editor = noteEditor(host);
    editor.value = "   ";
    press(editor, { key: "Enter", metaKey: true });

    expect(target.getNote(NOTED)).toBeNull();
  });

  it("leaves the note unchanged on Escape and returns focus to the grid", () => {
    const { host, grid: target } = mount();

    openEditor(target, NOTED);
    const editor = noteEditor(host);
    editor.value = "Discard this";
    press(editor, { key: "Escape" });

    expect(target.getNote(NOTED)).toBe("Check the totals");
    expect(host.querySelector(".sheetwrite-note-editor")).toBeNull();
    expect(document.activeElement).toBe(host);
  });

  it("opens on the focus cell when Shift+F2 is pressed", () => {
    const { host, grid: target } = mount();
    target.setSelection({ kind: "cell", addr: NOTED });

    press(host, { key: "F2", shiftKey: true });

    const editor = noteEditor(host);
    expect(editor.value).toBe("Check the totals");
    expect(host.querySelector(".sheetwrite-editor")).toBeNull();
  });
});

describe("deleteNote", () => {
  it("removes the focus cell's note", () => {
    const { grid: target } = mount();
    target.setSelection({ kind: "cell", addr: NOTED });

    target.actions.deleteNote();

    expect(target.getNote(NOTED)).toBeNull();
  });

  it("keeps the note on a read-only grid", () => {
    const { grid: target } = mount({ readOnly: true });
    target.setSelection({ kind: "cell", addr: NOTED });

    target.actions.deleteNote();

    expect(target.getNote(NOTED)).toBe("Check the totals");
  });
});
