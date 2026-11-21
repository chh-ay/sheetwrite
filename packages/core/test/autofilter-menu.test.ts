import { afterEach, describe, expect, it } from "bun:test";

import { AutoFilterMenu, type AutoFilterMenuRequest } from "../src/autofilter-menu.js";
import { DEFAULT_THEME } from "../src/grid.js";
import type { ColumnFilter } from "../src/types.js";

afterEach(() => {
  document.body.replaceChildren();
});

function open(overrides: Partial<AutoFilterMenuRequest> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const applied: (ColumnFilter | null)[] = [];
  const sorted: boolean[] = [];
  let closed = 0;
  const menu = new AutoFilterMenu(host, DEFAULT_THEME);
  menu.open({
    anchor: { left: 10, top: 10, bottom: 30 },
    header: "Item",
    kind: "text",
    values: ["pear", 3, null, 1, "apple"],
    counts: [1, 1, 1, 1, 1],
    kept: null,
    rows: 5,
    total: 5,
    filter: undefined,
    format: (value) => String(value),
    isDate: () => false,
    parse: (text) => (Number.isFinite(Number(text)) ? Number(text) : text),
    canSort: true,
    sort: (ascending) => sorted.push(ascending),
    apply: (filter) => applied.push(filter),
    closed: () => {
      closed++;
    },
    ...overrides,
  });
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  const list = document.querySelector<HTMLElement>('[role="listbox"]');
  if (!dialog || !list) throw new Error("the dropdown did not open");
  const key = (target: HTMLElement, name: string, init: KeyboardEventInit = {}) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }),
    );
  const options = () =>
    [...list.querySelectorAll<HTMLElement>('[role="option"]')].map((option) => [
      option.querySelector(".sheetwrite-autofilter-label")?.textContent,
      option.getAttribute("aria-checked") ?? option.getAttribute("aria-selected"),
    ]);
  return { menu, dialog, list, applied, sorted, key, options, closed: () => closed };
}

describe("AutoFilter dropdown", () => {
  it("is a labelled dialog with a multi-select value list in Excel's order", () => {
    const { dialog, list, options } = open({ kept: [1, "apple", null] });
    expect(dialog.getAttribute("aria-label")).toBe("Filter Item");
    expect(list.getAttribute("aria-multiselectable")).toBe("true");
    expect(list.getAttribute("aria-label")).toBe("Values of Item");
    expect(options()).toEqual([
      ["(Select All)", "mixed"],
      ["1", "true"],
      ["3", "false"],
      ["apple", "true"],
      ["pear", "false"],
      ["(Blanks)", "true"],
    ]);
    expect(
      [...dialog.querySelectorAll("button")].map((button) => button.textContent).slice(0, 4),
    ).toEqual(["Sort A to Z", "Sort Z to A", 'Clear Filter From "Item"', "Text Filters"]);
  });

  it("checks values from the keyboard and applies them with Enter", () => {
    const { list, applied, key, closed } = open();
    list.focus();
    key(list, "ArrowDown");
    key(list, " ");
    key(list, "End");
    key(list, " ");
    key(list, "Enter");
    expect(applied).toEqual([{ kind: "values", values: [3, "apple", "pear"] }]);
    expect(closed()).toBe(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("clears the filter when every value is checked again", () => {
    const first = open({ kept: [1] });
    first.list.focus();
    first.key(first.list, " ");
    first.key(first.list, "Enter");
    expect(first.applied).toEqual([null]);
  });

  it("ticks every search result, and adds them to the filter with Add current selection to filter", () => {
    const search = () => {
      const box = document.querySelector<HTMLInputElement>('input[type="search"]');
      if (!box) throw new Error("no search box");
      return box;
    };
    const replaced = open({ kept: [1] });
    search().value = "p";
    search().dispatchEvent(new Event("input"));
    expect(replaced.options()).toEqual([
      ["(Select All Search Results)", "true"],
      ["Add current selection to filter", "false"],
      ["apple", "true"],
      ["pear", "true"],
    ]);
    replaced.key(search(), "Enter");
    expect(replaced.applied).toEqual([{ kind: "values", values: ["apple", "pear"] }]);

    const added = open({ kept: [1] });
    search().value = "p";
    search().dispatchEvent(new Event("input"));
    added.list.focus();
    added.key(added.list, "ArrowDown");
    added.key(added.list, " ");
    added.key(added.list, "End");
    added.key(added.list, " ");
    expect(added.options()).toContainEqual(["Add current selection to filter", "true"]);
    expect(added.options()).toContainEqual(["pear", "false"]);
    added.key(added.list, "Enter");
    expect(added.applied).toEqual([{ kind: "values", values: [1, "apple"] }]);
  });

  it("disables OK while nothing is checked and closes on Escape without applying", () => {
    const { list, applied, key, closed } = open();
    list.focus();
    key(list, " ");
    const ok = document.querySelector<HTMLButtonElement>(".sheetwrite-autofilter-ok");
    expect(ok?.disabled).toBe(true);
    key(list, "Enter");
    expect(applied).toEqual([]);
    key(list, "Escape");
    expect(closed()).toBe(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("applies a Number Filters condition through the Custom AutoFilter form", () => {
    const { dialog, applied, key } = open({ kind: "number", values: [1, 2, 30] });
    const menuButton = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "Number Filters",
    );
    menuButton?.click();
    expect(menuButton?.getAttribute("aria-expanded")).toBe("true");
    const between = [...dialog.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === "Between…",
    );
    between?.click();

    const form = dialog.querySelector<HTMLFormElement>("form");
    if (!form) throw new Error("no Custom AutoFilter form");
    expect(form.getAttribute("aria-label")).toBe("Custom AutoFilter for Item");
    const [low, high] = [...form.querySelectorAll<HTMLInputElement>('input[type="text"]')];
    if (!low || !high) throw new Error("no condition values");
    low.value = "2";
    high.value = "20";
    key(low, "Escape", { bubbles: true });
    expect(dialog.querySelector("form")).toBeNull();

    // Opened again, it submits the two conditions joined by And.
    menuButton?.click();
    between?.click();
    const again = dialog.querySelector<HTMLFormElement>("form");
    const [from, to] = [...(again?.querySelectorAll<HTMLInputElement>('input[type="text"]') ?? [])];
    if (!again || !from || !to) throw new Error("no form");
    from.value = "2";
    to.value = "20";
    again.requestSubmit();
    expect(applied).toEqual([
      {
        kind: "custom",
        join: "and",
        conditions: [
          { op: "gte", value: 2 },
          { op: "lte", value: 20 },
        ],
      },
    ]);
  });

  it("counts each value's rows, and the rows OK keeps as values are ticked", () => {
    const { list, key } = open({
      values: ["North", "South", "Noth"],
      counts: [12, 1_200, 1],
      rows: 1_213,
      total: 1_500,
    });
    const tallies = [...list.querySelectorAll(".sheetwrite-autofilter-tally")].map(
      (tally) => tally.textContent,
    );
    // In the list's order: North, Noth, South.
    expect(tallies).toEqual([" 12", " 1", " 1,200"]);
    const ok = document.querySelector<HTMLButtonElement>(".sheetwrite-autofilter-ok");
    expect(ok?.textContent).toBe("OK (1,213 of 1,500 rows)");
    expect(ok?.getAttribute("aria-label")).toBe("OK");

    // Untick South, the last value in the list's order.
    list.focus();
    key(list, "End");
    key(list, " ");
    expect(ok?.textContent).toBe("OK (13 of 1,500 rows)");
  });

  it("sorts from its first commands", () => {
    const { dialog, sorted } = open({ kind: "number", values: [1, 2] });
    const [ascending] = [...dialog.querySelectorAll("button")];
    expect(ascending?.textContent).toBe("Sort Smallest to Largest");
    ascending?.click();
    expect(sorted).toEqual([true]);
  });
});
