// The panels a sheet tab's menu opens: Excel's Move or Copy dialog and its
// Tab Color palette. They show in place of the menu's items and close as the
// menu does (Escape, a press outside, or focus leaving them). They load on
// first use.

import type { SheetTabCommand, SheetTabs } from "./sheet-tabs.js";
import type { SheetId } from "./types/coordinates.js";
import type { Sheet } from "./types/document.js";
import type { Grid } from "./types/grid.js";

/** Show the Move or Copy dialog or the Tab Color palette of sheet `id` in its open menu. */
export function openTabPanel(
  grid: Grid,
  tabs: SheetTabs,
  command: SheetTabCommand,
  id: SheetId,
): void {
  const sheet = grid.store.getWorkbook().sheets.find((candidate) => candidate.id === id);
  if (!sheet) return;
  const panel =
    command === "tabColor"
      ? createTabColorPalette(grid, tabs, sheet)
      : createMoveCopyDialog(grid, tabs, sheet);
  tabs.showPanel(id, panel);
  panel.querySelector<HTMLElement>("select, button")?.focus();
}

/** Excel's standard tab colors, in the order of its Tab Color palette. */
const TAB_COLORS: ReadonlyArray<readonly [name: string, color: string]> = [
  ["Dark Red", "#C00000"],
  ["Red", "#FF0000"],
  ["Orange", "#FFC000"],
  ["Yellow", "#FFFF00"],
  ["Light Green", "#92D050"],
  ["Green", "#00B050"],
  ["Light Blue", "#00B0F0"],
  ["Blue", "#0070C0"],
  ["Dark Blue", "#002060"],
  ["Purple", "#7030A0"],
];

function createButton(className: string, text: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  return button;
}

/** Excel's Tab Color palette: the standard colors, then No Color. Arrow keys, Home and End move. */
function createTabColorPalette(grid: Grid, tabs: SheetTabs, sheet: Sheet): HTMLElement {
  const palette = document.createElement("div");
  palette.className = "sheetwrite-tab-menu sheetwrite-tab-panel sheetwrite-tab-colors";
  palette.setAttribute("role", "menu");
  palette.setAttribute("aria-label", "Tab color");
  // As in the sheet menu, a press must not move focus out and close it first.
  palette.addEventListener("mousedown", (event) => event.preventDefault());

  const choices: ReadonlyArray<readonly [name: string, color: string | null]> = [
    ...TAB_COLORS,
    ["No Color", null],
  ];
  const current = sheet.tabColor?.toUpperCase() ?? null;
  const swatches: HTMLButtonElement[] = [];
  for (const [name, color] of choices) {
    const swatch = createButton(
      color === null ? "sheetwrite-tab-swatch sheetwrite-tab-swatch-none" : "sheetwrite-tab-swatch",
      color === null ? name : "",
    );
    swatch.tabIndex = -1;
    swatch.title = name;
    swatch.setAttribute("role", "menuitemradio");
    swatch.setAttribute("aria-label", name);
    swatch.setAttribute("aria-checked", String(current === color));
    if (color !== null) swatch.style.backgroundColor = color;
    swatch.addEventListener("click", () =>
      tabs.performLifecycle(sheet.id, () => grid.setSheetTabColor(sheet.id, color), true),
    );
    swatches.push(swatch);
  }

  palette.addEventListener("keydown", (event) => {
    const index = swatches.indexOf(document.activeElement as HTMLButtonElement);
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    let next: number | null = step === 0 ? null : index + step;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = swatches.length - 1;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    swatches[(next + swatches.length) % swatches.length]!.focus();
  });
  palette.append(...swatches);
  return palette;
}

function createOption(text: string, value: number): HTMLOptionElement {
  const option = document.createElement("option");
  option.textContent = text;
  option.value = String(value);
  return option;
}

/**
 * Excel's Move or Copy dialog: the sheet to put the tab before, or the end,
 * and whether to create a copy instead of moving the sheet. The copy is
 * activated.
 */
function createMoveCopyDialog(grid: Grid, tabs: SheetTabs, sheet: Sheet): HTMLElement {
  const sheets = grid.store.getWorkbook().sheets;
  const dialog = document.createElement("div");
  dialog.className = "sheetwrite-tab-menu sheetwrite-tab-panel sheetwrite-tab-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", `Move or copy ${sheet.name} sheet`);
  // WebKit does not focus a pressed button or checkbox, so a press would move
  // focus out and close the dialog first; the list takes its presses.
  dialog.addEventListener("mousedown", (event) => {
    if (!(event.target instanceof Element && event.target.closest("select"))) {
      event.preventDefault();
    }
  });

  const listLabel = document.createElement("span");
  listLabel.className = "sheetwrite-tab-dialog-label";
  listLabel.textContent = "Before sheet:";
  listLabel.setAttribute("aria-hidden", "true");
  const list = document.createElement("select");
  list.size = 6;
  list.setAttribute("aria-label", "Before sheet");
  sheets.forEach((candidate, index) => {
    if ((candidate.visibility ?? "visible") === "visible") {
      list.appendChild(createOption(candidate.name, index));
    }
  });
  list.appendChild(createOption("(move to end)", sheets.length));
  list.selectedIndex = 0;

  const copyLabel = document.createElement("label");
  copyLabel.className = "sheetwrite-tab-dialog-check";
  const copy = document.createElement("input");
  copy.type = "checkbox";
  copy.setAttribute("aria-label", "Create a copy");
  copyLabel.append(copy, " Create a copy");

  const ok = (): void => {
    const before = Number(list.value);
    if (copy.checked) {
      const result = grid.copySheet(sheet.id, { index: before });
      if (result.status === "applied") grid.setActiveSheet(result.sheet);
      tabs.performLifecycle(sheet.id, () => result);
      return;
    }
    const from = sheets.findIndex((candidate) => candidate.id === sheet.id);
    const to = from < before ? before - 1 : before;
    if (to === from) tabs.closeMenu(true);
    else tabs.performLifecycle(sheet.id, () => grid.moveSheet(sheet.id, to), true);
  };
  const okButton = createButton("sheetwrite-tab-dialog-button", "OK");
  okButton.addEventListener("click", ok);
  const cancel = createButton("sheetwrite-tab-dialog-button", "Cancel");
  cancel.addEventListener("click", () => tabs.closeMenu(true));
  const buttons = document.createElement("div");
  buttons.className = "sheetwrite-tab-dialog-buttons";
  buttons.append(okButton, cancel);

  list.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    ok();
  });
  dialog.append(listLabel, list, copyLabel, buttons);
  return dialog;
}
