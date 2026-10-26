import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Workbook } from "../src/types.js";

let restore: () => void;
const grids: GridImpl[] = [];

const RIBBON_MODULE = "../src/ribbon/ribbon.js";

beforeAll(async () => {
  await initSheetwrite();
  // Load the ribbon chunk once, so each grid's own import resolves at once.
  await import(RIBBON_MODULE);
});
beforeEach(() => {
  restore = installCanvasTestStubs();
});
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  document.body.replaceChildren();
  restore();
});

/**
 * The grid imports the ribbon lazily. Awaiting the same module after the grid
 * asked for it runs the grid's mount callback first, so no timer is needed.
 */
async function ribbonMounted(host: HTMLElement): Promise<void> {
  await import(RIBBON_MODULE);
  if (!host.querySelector(".sheetwrite-ribbon")) throw new Error("the ribbon did not mount");
}

async function setup(readOnly = false) {
  const workbook: Workbook = {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet",
        rowCount: 3,
        columns: [
          { key: "a", header: "A", type: "number", width: 100 },
          { key: "b", header: "B", type: "number", width: 100 },
        ],
      },
    ],
  };
  const store = new SheetwriteStore(workbook, {
    rowCount: 3,
    columns: { a: [1, 2, 3], b: [4, 5, 6] },
  });
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 900 }, clientHeight: { value: 500 } });
  document.body.appendChild(host);
  const grid = new GridImpl(host, { workbook, readOnly, config: { ribbon: true } }, store);
  grids.push(grid);
  await ribbonMounted(host);

  const control = <T extends HTMLElement = HTMLButtonElement>(label: string): T => {
    const element = host.querySelector<T>(`.sheetwrite-ribbon [aria-label="${label}"]`);
    if (element === null) throw new Error(`no ribbon control "${label}"`);
    return element;
  };
  const select = (row: number, col: number, endRow = row) =>
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row, col }, end: { row: endRow, col } },
    });
  const cell = (row: number, col: number) => store.getCell({ sheet: "s1", row, col });
  const key = (target: HTMLElement, name: string) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
    );
  // Enter or Space on a button: a click whose detail is 0.
  const press = (target: HTMLElement) =>
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  return { grid, host, control, select, cell, key, press };
}

it("shows Bold pressed, unpressed or mixed for the selection", async () => {
  const { grid, control, select } = await setup();
  grid.styleRange(
    { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
    { bold: true },
  );

  select(0, 0);
  expect(control("Bold").getAttribute("aria-pressed")).toBe("true");
  select(1, 0);
  expect(control("Bold").getAttribute("aria-pressed")).toBe("false");
  select(0, 0, 1);
  expect(control("Bold").getAttribute("aria-pressed")).toBe("mixed");
});

it("shows the focus cell's size in points and applies typed points as pixels", async () => {
  const { grid, host, control, select, cell, key } = await setup();
  grid.styleRange(
    { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    { fontSize: 16 },
  );
  select(0, 0, 1);
  const size = control<HTMLInputElement>("Font Size");
  expect(size.value).toBe("12");

  size.focus();
  size.value = "14";
  key(size, "Enter");

  const fourteenPoints = (14 * 96) / 72;
  expect(cell(0, 0).style.fontSize).toBeCloseTo(fourteenPoints);
  expect(cell(1, 0).style.fontSize).toBeCloseTo(fourteenPoints);
  expect(size.value).toBe("14");
  expect(document.activeElement).toBe(host);
});

it("runs a border preset from the keyboard and returns focus to the menu button", async () => {
  const { host, control, select, cell, key, press } = await setup();
  select(0, 0);
  const options = control("Borders options");

  press(options);
  const menu = host.querySelector(".sheetwrite-ribbon-popup");
  expect(menu?.getAttribute("role")).toBe("menu");
  expect(menu?.getAttribute("aria-label")).toBe("Borders");
  expect(document.activeElement?.textContent).toBe("Bottom Border");

  key(document.activeElement as HTMLElement, "ArrowDown");
  expect(document.activeElement?.textContent).toBe("Top Border");
  press(document.activeElement as HTMLElement);

  expect(cell(0, 0).style.border?.top).toBeDefined();
  expect(cell(0, 0).style.border?.bottom).toBeUndefined();
  expect(host.querySelector(".sheetwrite-ribbon-popup")).toBeNull();
  expect(document.activeElement).toBe(options);

  press(options);
  key(document.activeElement as HTMLElement, "Escape");
  expect(host.querySelector(".sheetwrite-ribbon-popup")).toBeNull();
  expect(options.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(options);
});

it("disables editing controls while read-only but keeps view controls", async () => {
  const { grid, host, select, key, press } = await setup(true);
  select(0, 0);
  const find = (selector: string): HTMLButtonElement => {
    const element = host.querySelector<HTMLButtonElement>(selector);
    if (element === null) throw new Error(`nothing matches ${selector}`);
    return element;
  };
  const tab = (label: string): HTMLButtonElement => {
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const match = tabs.find((candidate) => candidate.textContent === label);
    if (match === undefined) throw new Error(`no ${label} tab`);
    return match;
  };
  // Only the visible tab's panel: Home and View both exist once visited.
  const control = (label: string) =>
    find(`.sheetwrite-ribbon-panel:not([hidden]) [aria-label="${label}"]`);

  expect(control("Bold").disabled).toBe(true);
  expect(control("Paste").disabled).toBe(true);
  expect(control("Find").disabled).toBe(false);

  grid.setReadOnly(false);
  expect(control("Bold").disabled).toBe(false);

  key(tab("Home"), "End");
  expect(tab("View").getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(tab("View"));
  grid.setReadOnly(true);
  press(control("Zoom In"));
  expect(control("Zoom In").disabled).toBe(false);
  expect(find(".sheetwrite-ribbon-panel:not([hidden]) output").textContent).toBe("110%");
  expect(grid.getZoom()).toBeCloseTo(1.1);
});

it("opens a list from a collapsed group without closing the group, then closes both", async () => {
  const { host, control, select, cell } = await setup();
  select(0, 0);
  const groupButton = host.querySelector<HTMLButtonElement>(
    '.sheetwrite-ribbon-group[aria-label="Number"] .sheetwrite-ribbon-group-button',
  );
  if (groupButton === null) throw new Error("no Number group button");
  const click = (target: Element) =>
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  const popups = () => host.querySelectorAll(".sheetwrite-ribbon-popup");

  click(groupButton);
  const listArrow = host.querySelector(
    '.sheetwrite-ribbon-popup [aria-label="Number Format list"]',
  );
  if (listArrow === null) throw new Error("group popup does not hold the format box");
  click(listArrow);
  expect([...popups()].map((popup) => popup.getAttribute("role"))).toEqual(["group", "listbox"]);

  const percentage = [...host.querySelectorAll('[role="option"]')].find(
    (option) => option.textContent === "Percentage",
  );
  if (percentage === undefined) throw new Error("no Percentage option");
  click(percentage);

  expect(cell(0, 0).style.numberFormat).toBe("0.00%");
  expect(popups()).toHaveLength(0);
  // The group's controls are back in the ribbon, not lost with the popup.
  expect(groupButton.parentElement?.contains(control("Number Format list"))).toBe(true);
});

it("fills from a palette pick and clears with No Fill", async () => {
  const { host, control, select, cell } = await setup();
  const click = (target: Element) =>
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  const pick = (label: string) => {
    click(control("Fill Color options"));
    const entry = host.querySelector(`.sheetwrite-ribbon-palette [aria-label="${label}"]`);
    if (entry === null) throw new Error(`no palette entry "${label}"`);
    click(entry);
  };

  select(0, 0);
  pick("#c00000");
  expect(cell(0, 0).style.backgroundColor).toBe("#c00000");
  expect(host.querySelector(".sheetwrite-ribbon-popup")).toBeNull();
  // A command ignores a second start while it runs, so let the first pick settle.
  await Promise.resolve();

  pick("No Fill");
  expect(cell(0, 0).style.backgroundColor).toBeUndefined();
});

it("gives the grid the panel's height back when minimized", async () => {
  const { host, key } = await setup();
  const viewport = host.querySelector<HTMLElement>(".sheetwrite-viewport");
  const home = host.querySelector<HTMLElement>('[role="tab"]');
  if (viewport === null || home === null) throw new Error("grid not mounted");
  expect(viewport.style.top).toBe("122px");

  home.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  expect(viewport.style.top).toBe("30px");
  expect(host.querySelector(".sheetwrite-ribbon-panel:not([hidden])")).toBeNull();

  home.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  expect(viewport.style.top).toBe("122px");

  home.focus();
  key(home, "Escape");
  expect(document.activeElement).toBe(host);
});
