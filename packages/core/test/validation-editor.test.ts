import { afterEach, describe, expect, it } from "bun:test";

import { expectSame } from "../../../test/expect-same.js";
import { DEFAULT_THEME } from "../src/grid.js";
import type { CellScalar, DataValidationRule } from "../src/types.js";
import { type BeginValidationEditOptions, ValidationEditor } from "../src/validation-editor.js";

const rect = { x: 20, y: 30, w: 120, h: 28 };
const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 0 } };
const regions = ["North", "South", "East", "West", "North-East", "South-West"];

function list_rule(): DataValidationRule {
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

function press(target: Element | null, key: string, shift_key = false): void {
  target?.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: shift_key, bubbles: true }));
}

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function shown_items(): string[] {
  return [...document.querySelectorAll('[role="option"]')].map(
    (option) => option.textContent ?? "",
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("ValidationEditor", () => {
  function open_list(fields: Partial<BeginValidationEditOptions> = {}) {
    const editor = new ValidationEditor(host());
    const commits: Array<{ value: CellScalar; navigate: string }> = [];
    const texts: Array<{ text: string; navigate: string }> = [];
    let cancels = 0;
    editor.begin({
      row: 0,
      col: 0,
      rule: list_rule(),
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

  it("starts on the cell's value and stores the text when no item is highlighted", () => {
    let list = open_list();
    expect(shown_items()).toEqual(regions);
    const active = list.input.getAttribute("aria-activedescendant") ?? "";
    expect(document.getElementById(active)?.textContent).toBe("East");
    press(list.input, "Tab");
    expect(list.commits).toEqual([{ value: "East", navigate: "right" }]);

    list = open_list({ filter: "west" });
    press(list.input, "Enter");
    expect(list.commits).toEqual([{ value: "West", navigate: "down" }]);

    list = open_list({ filter: "Nowhere" });
    expect(shown_items()).toEqual([]);
    press(list.input, "Enter", true);
    expect(list.texts).toEqual([{ text: "Nowhere", navigate: "up" }]);

    list = open_list();
    press(list.input, "Escape");
    expect(list.cancels()).toBe(1);
    expect(list.commits).toEqual([]);
    list.editor.destroy();
  });

  // #1095: Excel keeps the cell's value in sight while its list is open.
  it("leaves the cell in sight when opened without typing, until the first typed text", () => {
    const { editor, input } = open_list();
    const box = input.parentElement;
    const current = document.querySelector('[role="option"][aria-selected="true"]');
    // Nothing covers the cell: the list opens below it, its own value highlighted.
    expect(box?.style.top).toBe(`${rect.y + rect.h}px`);
    expect(input.style.height).toBe("");
    expect(current?.textContent).toBe("East");
    expectSame(document.activeElement, input);

    // Typing replaces the value: the box moves over the cell and filters the list.
    type(input, "s");
    expectSame(input.parentElement, box);
    expect(box?.style.top).toBe(`${rect.y}px`);
    expect(input.style.height).toBe(`${rect.h}px`);
    expect(shown_items()).toEqual(["South", "East", "West", "North-East", "South-West"]);
    editor.destroy();
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
