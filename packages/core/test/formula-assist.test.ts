import { afterEach, describe, expect, it } from "bun:test";
import { EditController } from "../src/editor.js";
import { type AssistDeps, FormulaAssist } from "../src/formula-assist.js";
import type { HighlightRange, Theme } from "../src/types.js";

// A full Theme so `attach`/`begin` type-check; only the color fields matter here.
const THEME: Theme = {
  font: "13px sans-serif",
  bg: "#ffffff",
  fg: "#111111",
  gridLine: "#eeeeee",
  headerBg: "#f4ede1",
  headerFg: "#6b4a1f",
  selection: "#2563eb33",
  selectionBorder: "#2563eb",
  rowHeight: 28,
  headerHeight: 28,
  rowHeaderWidth: 48,
  searchMatch: "#fff47580",
  searchActiveMatch: "#fbbc04",
  highlight: "#e8f0fe99",
};

function keydown(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
}

// A textarea mounted in a host, with the inline geometry the editor sets so the
// popup can anchor under it.
function mountTextarea(): { host: HTMLElement; ta: HTMLTextAreaElement } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const ta = document.createElement("textarea");
  ta.style.left = "10px";
  ta.style.top = "20px";
  ta.style.width = "80px";
  ta.style.height = "24px";
  host.appendChild(ta);
  return { host, ta };
}

function itemsOf(host: HTMLElement): string[] {
  return [...host.querySelectorAll('[role="option"]')].map((el) => el.textContent ?? "");
}

function selectedItem(host: HTMLElement): string | null {
  return host.querySelector('[role="option"][aria-selected="true"]')?.textContent ?? null;
}

/** Highlight colors must be visible and tell different references apart. */
function expectDistinctColors(ranges: readonly HighlightRange[]): void {
  const colors = ranges.map((range) => range.color);
  for (const color of colors) expect(color).toBeTruthy();
  expect(new Set(colors).size).toBe(colors.length);
}

const noopDeps = (): AssistDeps => ({ highlightCells: () => {}, sheet: () => "s1" });

afterEach(() => {
  document.body.innerHTML = "";
});

// The parser and assist name lists are kept in step by scripts/formula-contract.test.ts.

// ── autocomplete popup ───────────────────────────────────────────────────────

describe("FormulaAssist autocomplete", () => {
  it("filters the popup by the caret token", () => {
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, noopDeps());

    ta.value = "=SU";
    ta.setSelectionRange(3, 3);
    assist.attach(ta, THEME);

    expect(assist.isOpen).toBe(true);
    const su = itemsOf(host);
    expect(su).toContain("SUM");
    expect(su.every((name) => name.startsWith("SU"))).toBe(true);

    ta.value = "=CO";
    ta.setSelectionRange(3, 3);
    assist.update();
    const co = itemsOf(host);
    expect(co).toContain("COUNT");
    expect(co.every((name) => name.startsWith("CO"))).toBe(true);

    // No name to complete: right after "(", or an empty formula.
    for (const [text, caret] of [
      ["=SUM(", 5],
      ["=", 1],
    ] as const) {
      ta.value = text;
      ta.setSelectionRange(caret, caret);
      assist.update();
      expect(assist.isOpen).toBe(false);
    }
  });

  it("completes dotted parser names without treating leading decimals as names", () => {
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, noopDeps());

    ta.value = "=MODE.";
    ta.setSelectionRange(6, 6);
    assist.attach(ta, THEME);
    expect(itemsOf(host)).toEqual(["MODE.SNGL"]);
    expect(assist.handleKeyDown(keydown("Enter"))).toBe(true);
    expect(ta.value).toBe("=MODE.SNGL(");

    ta.value = "=.5";
    ta.setSelectionRange(3, 3);
    assist.update();
    expect(assist.isOpen).toBe(false);
  });

  it("replaces only the token at a mid-string caret", () => {
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, noopDeps());

    ta.value = "=SU)";
    ta.setSelectionRange(3, 3); // caret right after "SU", before ")"
    assist.attach(ta, THEME);

    expect(assist.handleKeyDown(keydown("Tab"))).toBe(true);
    expect(ta.value).toBe("=SUM()");
    expect(ta.selectionStart).toBe(5);
  });

  it("navigates with Up/Down only while open and accepts the highlighted item", () => {
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, noopDeps());

    ta.value = "=CO";
    ta.setSelectionRange(3, 3);
    assist.attach(ta, THEME);
    const items = itemsOf(host);
    expect(items.length).toBeGreaterThan(2);
    expect(selectedItem(host)).toBe(items[0]!);

    expect(assist.handleKeyDown(keydown("ArrowDown"))).toBe(true);
    expect(selectedItem(host)).toBe(items[1]!);

    expect(assist.handleKeyDown(keydown("ArrowUp"))).toBe(true);
    expect(assist.handleKeyDown(keydown("ArrowUp"))).toBe(true); // wraps to last
    expect(selectedItem(host)).toBe(items.at(-1)!);

    assist.handleKeyDown(keydown("Enter"));
    expect(ta.value).toBe(`=${items.at(-1)}(`);

    // Closed: arrow keys belong to the editor again.
    expect(assist.isOpen).toBe(false);
    expect(assist.handleKeyDown(keydown("ArrowDown"))).toBe(false);
    expect(ta.value).toBe(`=${items.at(-1)}(`);
  });
});

// ── reference highlighting ───────────────────────────────────────────────────

describe("FormulaAssist ref highlighting", () => {
  it("calls the highlight dep with parsed, colored ranges and clears on detach", () => {
    const calls: (HighlightRange[] | null)[] = [];
    const { host, ta } = mountTextarea();
    const assist = new FormulaAssist(host, {
      highlightCells: (ranges) => calls.push(ranges),
      sheet: () => "s1",
    });

    ta.value = "=SUM(A1:B2)+C3+$D$4";
    ta.setSelectionRange(ta.value.length, ta.value.length);
    assist.attach(ta, THEME);

    const ranges = calls.at(-1) ?? [];
    expect(ranges.map(({ sheet, start, end }) => ({ sheet, start, end }))).toEqual([
      { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
      { sheet: "s1", start: { row: 2, col: 2 }, end: { row: 2, col: 2 } },
      { sheet: "s1", start: { row: 3, col: 3 }, end: { row: 3, col: 3 } },
    ]);
    expectDistinctColors(ranges);

    assist.detach();
    expect(calls.at(-1)).toBeNull();
  });
});

// ── EditController integration ───────────────────────────────────────────────

describe("EditController with assist deps", () => {
  function begin(): {
    editor: EditController;
    host: HTMLElement;
    ta: HTMLTextAreaElement;
    state: {
      cancelled: boolean;
      committed: string | null;
      highlights: (HighlightRange[] | null)[];
    };
  } {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const state = {
      cancelled: false,
      committed: null as string | null,
      highlights: [] as (HighlightRange[] | null)[],
    };

    const editor = new EditController(host, {
      highlightCells: (ranges) => state.highlights.push(ranges),
      sheet: () => "s1",
    });

    editor.begin({
      row: 0,
      col: 0,
      type: "text",
      initial: "",
      selectAll: false,
      rect: { x: 10, y: 20, w: 80, h: 24 },
      label: "Edit A, row 1",
      theme: THEME,
      onCommit: (value) => {
        state.committed = value;
      },
      onCancel: () => {
        state.cancelled = true;
      },
    });

    const ta = host.querySelector("textarea.sheetwrite-editor");
    if (!(ta instanceof HTMLTextAreaElement)) throw new Error("editor textarea missing");
    return { editor, host, ta, state };
  }

  it("opens the popup on formula input and highlights refs", () => {
    const { host, ta, state } = begin();

    ta.value = "=SUM(A1)";
    ta.setSelectionRange(5, 5); // after "=SUM(", token empty → no popup, but refs highlight
    ta.dispatchEvent(new Event("input"));
    const ranges = state.highlights.at(-1) ?? [];
    expect(ranges.map(({ sheet, start, end }) => ({ sheet, start, end }))).toEqual([
      { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
    ]);
    expectDistinctColors(ranges);

    ta.value = "=SU";
    ta.setSelectionRange(3, 3);
    ta.dispatchEvent(new Event("input"));
    expect(host.querySelector('[role="listbox"]')).not.toBeNull();
    expect(itemsOf(host)).toContain("SUM");
  });

  it("first Escape closes the popup, second cancels the edit and clears highlights", () => {
    const { editor, host, ta, state } = begin();

    ta.value = "=SUM(A1)";
    ta.setSelectionRange(6, 6); // caret after "A" → token "A" opens popup
    ta.dispatchEvent(new Event("input"));
    expect(host.querySelector(".sheetwrite-assist")).not.toBeNull();

    ta.dispatchEvent(keydown("Escape"));
    expect(host.querySelector(".sheetwrite-assist")).toBeNull();
    expect(editor.isEditing).toBe(true);
    expect(state.cancelled).toBe(false);

    ta.dispatchEvent(keydown("Escape"));
    expect(state.cancelled).toBe(true);
    expect(editor.isEditing).toBe(false);
    expect(state.highlights.at(-1)).toBeNull(); // cleared on teardown
  });

  it("clears highlights on commit", () => {
    const { editor, ta, state } = begin();

    ta.value = "=SUM(A1)";
    ta.setSelectionRange(8, 8);
    ta.dispatchEvent(new Event("input"));
    expect(state.highlights.at(-1)).not.toBeNull();

    editor.commit("down");
    expect(state.committed).toBe("=SUM(A1)");
    expect(state.highlights.at(-1)).toBeNull();
  });
});
