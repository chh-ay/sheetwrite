import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { renderControl } from "../src/ribbon/ribbon-controls.js";
import { RibbonPopup } from "../src/ribbon/ribbon-popup.js";
import { createToolbar } from "../src/shell.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { GridConfig, IconOverrides, Workbook } from "../src/types.js";

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

async function setup(readOnly = false, icons?: IconOverrides, ribbon: GridConfig["ribbon"] = true) {
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
  const config: GridConfig = { ribbon, ...(icons === undefined ? {} : { icons }) };
  const grid = new GridImpl(host, { workbook, readOnly, config }, store);
  grids.push(grid);
  await ribbonMounted(host);

  const control = <T extends HTMLElement = HTMLButtonElement>(
    label: string,
    scope = ".sheetwrite-ribbon",
  ): T => {
    const element = host.querySelector<T>(`${scope} [aria-label="${label}"]`);
    if (element === null) throw new Error(`no ribbon control "${label}"`);
    return element;
  };
  const openTab = (name: string): void => {
    const tab = [...host.querySelectorAll<HTMLElement>('.sheetwrite-ribbon [role="tab"]')].find(
      (candidate) => candidate.textContent === name,
    );
    if (tab === undefined) throw new Error(`no ribbon tab "${name}"`);

    tab.click();
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
  return { grid, host, control, openTab, select, cell, key, press };
}

it.each(["full", "compact"] as const)(
  "%s ribbon runs commands and follows selection, history and read-only state",
  async (mode) => {
    const { grid, host, control, select, cell, press } = await setup(false, undefined, { mode });
    select(0, 0);
    const undo = control("Undo", ".sheetwrite-ribbon-group-body");
    const bold = control("Bold");
    // A command runs through the async action feedback, which settles in microtasks.
    const settle = async (): Promise<void> => {
      for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    };

    expect(host.querySelector(".sheetwrite-ribbon")?.getAttribute("data-mode")).toBe(mode);
    expect(undo.disabled).toBe(true);
    expect(bold.getAttribute("aria-pressed")).toBe("false");
    press(bold);
    await settle();
    expect(cell(0, 0).style.bold).toBe(true);
    expect(bold.getAttribute("aria-pressed")).toBe("true");
    expect(undo.disabled).toBe(false);

    press(undo);
    await settle();
    expect(cell(0, 0).style.bold).not.toBe(true);
    select(1, 0);
    expect(bold.getAttribute("aria-pressed")).toBe("false");
    grid.setReadOnly(true);
    expect(bold.disabled).toBe(true);
    expect(control("Find").disabled).toBe(false);
  },
);

it("keeps only tabs in the tablist and the layout buttons beside it", async () => {
  const { host, control } = await setup();
  const tablist = host.querySelector('.sheetwrite-ribbon [role="tablist"]');
  if (tablist === null) throw new Error("no ribbon tablist");

  const roles = [...tablist.children].map((child) => child.getAttribute("role"));
  // Formulas is in the list but hidden while the store has no host functions.
  expect(roles).toEqual(["tab", "tab", "tab", "tab", "tab"]);
  for (const label of ["Compact ribbon", "Collapse the ribbon"]) {
    const button = control(label);
    expect(tablist.contains(button), label).toBe(false);
    expect(button.parentElement).toBe(tablist.parentElement);
  }
});

it("switches layout without losing a value-box draft or the active tab", async () => {
  const { host, control, openTab, press } = await setup();
  const size = control<HTMLInputElement>("Font Size");
  size.value = "14";
  press(control("Compact ribbon"));

  expect(control<HTMLInputElement>("Font Size").value).toBe("14");
  expect(control("Compact ribbon").getAttribute("aria-pressed")).toBe("true");
  openTab("View");
  press(control("Compact ribbon"));
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("View");
  expect(control("Compact ribbon").getAttribute("aria-pressed")).toBe("false");
});

it("renders the same commands as the toolbar for the same command flags", async () => {
  const flags = { export: true, italic: false, sort: false };
  const { grid, host, openTab } = await setup(false, undefined, { mode: "compact" });
  grid.setConfig({ ribbon: true, ...flags });
  await ribbonMounted(host);

  const ribbonCommands = new Set<string>();
  for (const tab of ["Home", "Insert", "Data", "View"]) {
    openTab(tab);
    for (const element of host.querySelectorAll<HTMLElement>(".sheetwrite-ribbon [data-command]")) {
      ribbonCommands.add(element.dataset.command ?? "");
    }
  }

  const toolbarHost = document.createElement("div");
  document.body.appendChild(toolbarHost);
  const toolbar = createToolbar(toolbarHost, grid, { flags });
  // Commands the grid cannot run now (Insert Function without host functions) are hidden in both.
  const toolbarCommands = [...toolbar.element.querySelectorAll<HTMLElement>("[data-command]")]
    .filter((element) => !element.hidden)
    .map((element) => element.dataset.command ?? "");
  toolbar.destroy();

  expect(new Set(toolbarCommands)).toEqual(ribbonCommands);
  expect(toolbarCommands).toHaveLength(ribbonCommands.size);
  expect(ribbonCommands.has("exportXlsx")).toBe(true);
  expect(ribbonCommands.has("italic")).toBe(false);
  expect(ribbonCommands.has("sortAsc")).toBe(false);
});

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

it("keeps a keyboard-opened menu open when focus would scroll the page", async () => {
  const { host, control, key } = await setup();
  const options = control("Borders options");
  // WebKit scrolls the document to show a focused menu item, even in a fixed
  // popup, and the scroll moves the trigger. Emulate that scroll for every
  // focus that does not prevent it.
  let scrolled = 0;
  Object.defineProperty(options, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(40, 500 - scrolled, 28, 24),
  });
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (this: HTMLElement, focusOptions?: FocusOptions) {
    focus.call(this, focusOptions);
    if (focusOptions?.preventScroll === true) return;

    scrolled += 24;
    document.dispatchEvent(new Event("scroll"));
  };
  try {
    options.focus({ preventScroll: true });
    key(options, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("Bottom Border");

    key(document.activeElement as HTMLElement, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("Top Border");
    expect(host.querySelector(".sheetwrite-ribbon-popup")?.getAttribute("aria-label")).toBe(
      "Borders",
    );
  } finally {
    HTMLElement.prototype.focus = focus;
  }
});

it("keeps a menu open for a scroll that leaves its trigger in place", async () => {
  const { host, control, key } = await setup();
  const options = control("Borders options");
  let triggerTop = 500;
  Object.defineProperty(options, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(40, triggerTop, 28, 24),
  });
  options.focus();
  key(options, "ArrowDown");
  const menu = () => host.querySelector('.sheetwrite-ribbon-popup[aria-label="Borders"]');
  expect(menu()).not.toBeNull();

  // WebKit can deliver the event of a page scroll that happened before the menu opened.
  document.dispatchEvent(new Event("scroll"));
  expect(menu()).not.toBeNull();
  expect(document.activeElement?.textContent).toBe("Bottom Border");

  // The page scrolls and the trigger moves: the placed menu would be wrong, so it closes.
  triggerTop = 300;
  document.dispatchEvent(new Event("scroll"));
  expect(menu()).toBeNull();
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

it("zooms with one readout that resets to 100% and is disabled there", async () => {
  const { grid, host, control, openTab, press } = await setup();
  openTab("View");

  const scope = ".sheetwrite-ribbon-panel:not([hidden])";
  const group = (): HTMLElement => {
    const element = host.querySelector<HTMLElement>(`${scope} .sheetwrite-ribbon-zoom`);
    if (element === null) throw new Error("no zoom group");

    return element;
  };

  // The step buttons show icons only, so the percent is the group's only text.
  expect(group().textContent).toBe("100%");
  expect(control("100%, zoom to 100%", scope).disabled).toBe(true);

  press(control("Zoom In", scope));
  press(control("Zoom In", scope));
  expect(group().textContent).toBe("120%");
  expect(control("120%, zoom to 100%", scope).disabled).toBe(false);

  press(control("120%, zoom to 100%", scope));
  expect(grid.getZoom()).toBe(1);
  expect(group().textContent).toBe("100%");
  expect(control("100%, zoom to 100%", scope).disabled).toBe(true);
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

it("replaces a glyph in every ribbon control that shows it, by glyph name", async () => {
  const custom = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  custom.setAttribute("data-icon", "custom-bold");
  const { host, control, openTab, select, press } = await setup(false, {
    bold: custom,
    hideRows: "HR",
  });

  // A node override is cloned into its button; untouched glyphs stay sheet crops.
  expect(control("Bold").querySelector("svg[data-icon=custom-bold]")).not.toBeNull();
  expect(control("Italic").querySelector(".sheetwrite-icon[data-icon=italic]")).not.toBeNull();

  // Hide Rows is a ribbon-only command: the Format menu item and the Data tab
  // button both take the override, and neither keeps the sheet glyph.
  // Edit commands are disabled until a cell is selected, as in the other menu tests.
  select(0, 0);
  press(control("Format"));
  const menuItem = [...host.querySelectorAll<HTMLElement>(".sheetwrite-ribbon-menu-item")].find(
    (item) => item.textContent?.includes("Hide Rows"),
  );
  expect(menuItem?.querySelector(".sheetwrite-ribbon-icon")?.textContent).toBe("HR");
  openTab("Data");
  const hideRows = control("Hide Rows");
  expect(hideRows.querySelector(".sheetwrite-ribbon-icon")?.textContent).toBe("HR");
  expect(hideRows.querySelector(".sheetwrite-icon")).toBeNull();
});

it("keeps Tab inside a form popup, wrapping at both ends", async () => {
  const { host, control, openTab, select, key, press } = await setup();
  openTab("Insert");
  select(0, 0);
  press(control("Link"));
  const field = host.querySelector<HTMLInputElement>(".sheetwrite-ribbon-popup input");
  const ok = host.querySelector<HTMLButtonElement>(".sheetwrite-ribbon-form-button");
  if (field === null || ok === null) throw new Error("the link form did not open");
  expect(document.activeElement).toBe(field);

  ok.focus();
  key(ok, "Tab");
  expect(document.activeElement).toBe(field);
  field.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
  );
  expect(document.activeElement).toBe(ok);
  expect(host.querySelector(".sheetwrite-ribbon-popup")).not.toBeNull();
});

it("shows a failed placement command in its form instead of rejecting", async () => {
  const { grid } = await setup();
  const popupHost = document.createElement("div");
  document.body.appendChild(popupHost);
  const submitted = Promise.withResolvers<string | null>();
  const view = renderControl(
    {
      kind: "placement",
      id: "pivotTable",
      label: "PivotTable",
      icon: "clear",
      unavailable: () => null,
      submit: () => submitted.promise,
    },
    {
      grid,
      popup: new RibbonPopup(popupHost),
      focus: () => {
        throw new Error("a placement form never reads the focus style");
      },
      focusGrid: () => {},
      run: (_key, command) => command(),
    },
  );
  popupHost.appendChild(view.element);
  if (!(view.element instanceof HTMLButtonElement)) throw new Error("expected a trigger button");
  view.element.click();
  const form = popupHost.querySelector("form");
  if (form === null) throw new Error("the placement form did not open");

  form.dispatchEvent(new Event("submit", { cancelable: true }));
  submitted.reject(new Error("the panel chunk failed to load"));
  // The submit handler awaits the rejected promise, then runs its catch.
  for (let turn = 0; turn < 4; turn++) await Promise.resolve();

  const error = form.querySelector<HTMLElement>(".sheetwrite-ribbon-form-error");
  expect(error?.hidden).toBe(false);
  expect(error?.textContent).toContain("the panel chunk failed to load");
});

it("hides the Formulas tab without host functions, and arrow keys skip it", async () => {
  const { host, key } = await setup();
  const tabs = [...host.querySelectorAll<HTMLElement>('.sheetwrite-ribbon [role="tab"]')];
  const formulas = tabs.find((tab) => tab.textContent === "Formulas");
  const insert = tabs.find((tab) => tab.textContent === "Insert");
  const data = tabs.find((tab) => tab.textContent === "Data");
  if (formulas === undefined || insert === undefined || data === undefined) {
    throw new Error("missing ribbon tabs");
  }
  expect(formulas.hidden).toBe(true);

  insert.focus();
  key(insert, "ArrowRight");
  expect(document.activeElement).toBe(data);
  key(data, "ArrowLeft");
  expect(document.activeElement).toBe(insert);
});

it("shows Insert Function with host functions on the full engine, in its own process", async () => {
  // Engine selection is process-wide, so the full-engine checks run apart.
  const probe = Bun.spawn(
    [process.execPath, "test", "./packages/core/test/ribbon-functions.full-engine.ts"],
    { cwd: new URL("../../..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stderr] = await Promise.all([probe.exited, new Response(probe.stderr).text()]);

  expect({ exitCode, failures: stderr.match(/^\(fail\).*$/gmu) ?? [] }).toEqual({
    exitCode: 0,
    failures: [],
  });
});
