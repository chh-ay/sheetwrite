import { afterEach, describe, expect, it } from "bun:test";

import { DEFAULT_THEME } from "../src/grid.js";
import type { CellScalar, DataValidationRule } from "../src/types.js";
import { type BeginValidationEditOptions, ValidationEditor } from "../src/validation-editor.js";

const rect = { x: 20, y: 30, w: 120, h: 28 };
const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 0 } };
const regions = ["North", "South", "East", "West", "North-East", "South-West"];

function listRule(): DataValidationRule {
  return {
    id: "region",
    range,
    condition: { kind: "list", values: regions },
    policy: "reject",
  };
}

function host(): HTMLDivElement {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return element;
}

function press(target: Element | null, key: string, shiftKey = false): void {
  target?.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
}

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function shownItems(): string[] {
  return [...document.querySelectorAll('[role="option"]')].map((option) => option.textContent ?? "");
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("ValidationEditor", () => {
  function openList(fields: Partial<BeginValidationEditOptions> = {}) {
    const editor = new ValidationEditor(host());
    const commits: Array<{ value: CellScalar; navigate: string }> = [];
    const texts: Array<{ text: string; navigate: string }> = [];
    let cancels = 0;
    editor.begin({
      row: 0,
      col: 0,
      rule: listRule(),
      values: regions,
      current: "East",
      filter: "",
      rect,
      theme: DEFAULT_THEME,
      onCommit: (value, navigate) => commits.push({ value, navigate }),
      onCommitText: (text, navigate) => texts.push({ text, navigate }),
      onCancel: () => {
        cancels++;
      },
      ...fields,
    });
    const input = document.querySelector<HTMLInputElement>('[role="combobox"]');
    if (!input) throw new Error("expected the list's box");
    return { editor, commits, texts, input, cancels: () => cancels };
  }

  it("filters the items by the typed text anywhere in them, ignoring case", () => {
    const { editor, commits, input } = openList({ filter: "w" });
    expect(document.activeElement).toBe(input);
    type(input, "we");
    expect(shownItems()).toEqual(["West", "South-West"]);
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);

    press(input, "ArrowDown");
    press(input, "ArrowDown");
    expect(document.getElementById(input.getAttribute("aria-activedescendant") ?? "")?.textContent).toBe(
      "South-West",
    );
    press(input, "Enter");
    expect(commits).toEqual([{ value: "South-West", navigate: "down" }]);
    editor.destroy();
  });

  it("starts on the cell's value and stores the text when no item is highlighted", () => {
    let list = openList();
    expect(shownItems()).toEqual(regions);
    press(list.input, "Tab");
    expect(list.commits).toEqual([{ value: "East", navigate: "right" }]);

    list = openList({ filter: "west" });
    press(list.input, "Enter");
    expect(list.commits).toEqual([{ value: "West", navigate: "down" }]);

    list = openList({ filter: "Nowhere" });
    expect(shownItems()).toEqual([]);
    press(list.input, "Enter", true);
    expect(list.texts).toEqual([{ text: "Nowhere", navigate: "up" }]);

    list = openList();
    press(list.input, "Escape");
    expect(list.cancels()).toBe(1);
    expect(list.commits).toEqual([]);
    list.editor.destroy();
  });

  it("renders a keyboard-toggleable checkbox with checked state", () => {
    const editor = new ValidationEditor(host());
    const commits: CellScalar[] = [];
    editor.begin({
      row: 1,
      col: 0,
      rule: {
        id: "done",
        range,
        condition: { kind: "checkbox", checkedValue: "yes", uncheckedValue: "no" },
        policy: "reject",
      },
      values: [],
      current: "no",
      filter: "",
      rect,
      theme: DEFAULT_THEME,
      onCommit: (value) => commits.push(value),
      onCommitText: () => {},
      onCancel: () => {},
    });

    const checkbox = document.querySelector<HTMLElement>('[role="checkbox"]');
    expect(checkbox?.getAttribute("aria-checked")).toBe("false");
    press(checkbox, " ");
    expect(commits).toEqual(["yes"]);
    editor.destroy();
  });
});
