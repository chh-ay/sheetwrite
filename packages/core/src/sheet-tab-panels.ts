// The panels a sheet tab's menu opens: Excel's Move or Copy dialog and its
// Tab Color palette. They load on first use, so a page that never opens them
// does not download them.

import type { SheetId } from "./types/coordinates.js";
import type { SheetLifecycleResult } from "./types/grid.js";

/** The sheet record a panel reads. */
export interface TabPanelSheet {
  readonly id: SheetId;
  readonly name: string;
  readonly tabColor?: string;
}

/** What a panel needs from the tab bar that opened it. */
export interface TabPanelHost {
  /** Every sheet, in workbook order. */
  readonly sheets: readonly TabPanelSheet[];
  /** The visible sheets, with their positions in `sheets`. */
  readonly visible: ReadonlyArray<{
    readonly sheet: TabPanelSheet;
    readonly workbookIndex: number;
  }>;
  /** Close the panel and give focus back to the tab's options button. */
  close(): void;
  /** Close the panel and run a lifecycle command, showing its error the way the menu does. */
  perform(
    operation: () => SheetLifecycleResult | Promise<SheetLifecycleResult>,
    restoreOptions: boolean,
  ): void;
  readonly onMove?: (id: SheetId, toIndex: number) => SheetLifecycleResult;
  readonly onCopy?: (
    id: SheetId,
    index: number,
  ) => SheetLifecycleResult | Promise<SheetLifecycleResult>;
  readonly onTabColor?: (id: SheetId, color: string | null) => SheetLifecycleResult;
}

/** The Tab Color palette or the Move or Copy dialog for `sheet`. */
export function createTabPanel(
  kind: "moveCopy" | "tabColor",
  host: TabPanelHost,
  sheet: TabPanelSheet,
): HTMLElement {
  return kind === "tabColor"
    ? createTabColorPalette(host, sheet)
    : createMoveCopyDialog(host, sheet);
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

/**
 * Excel's Tab Color palette: the standard colors, then No Color. Arrow keys,
 * Home and End move between the colors; Escape closes it.
 */
function createTabColorPalette(host: TabPanelHost, sheet: TabPanelSheet): HTMLElement {
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
      host.perform(() => host.onTabColor!(sheet.id, color), true),
    );
    swatches.push(swatch);
  }

  palette.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      host.close();
      return;
    }
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

function createOption(text: string, value: string): HTMLOptionElement {
  const option = document.createElement("option");
  option.textContent = text;
  option.value = value;
  return option;
}

/**
 * Excel's Move or Copy dialog: the sheet to put the tab before, or the end,
 * and whether to create a copy instead of moving the sheet.
 */
function createMoveCopyDialog(host: TabPanelHost, sheet: TabPanelSheet): HTMLElement {
  const dialog = document.createElement("div");
  dialog.className = "sheetwrite-tab-menu sheetwrite-tab-panel sheetwrite-tab-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", `Move or copy ${sheet.name} sheet`);

  const listLabel = document.createElement("span");
  listLabel.className = "sheetwrite-tab-dialog-label";
  listLabel.textContent = "Before sheet:";
  listLabel.setAttribute("aria-hidden", "true");
  const list = document.createElement("select");
  list.size = 6;
  list.setAttribute("aria-label", "Before sheet");
  for (const { sheet: candidate, workbookIndex } of host.visible) {
    list.appendChild(createOption(candidate.name, String(workbookIndex)));
  }
  list.appendChild(createOption("(move to end)", String(host.sheets.length)));
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
      host.perform(() => host.onCopy!(sheet.id, before), false);
      return;
    }
    const from = host.sheets.findIndex((candidate) => candidate.id === sheet.id);
    const to = from < before ? before - 1 : before;
    if (to === from) host.close();
    else host.perform(() => host.onMove!(sheet.id, to), true);
  };
  const okButton = createButton("sheetwrite-tab-dialog-button", "OK");
  okButton.addEventListener("click", ok);
  const cancel = createButton("sheetwrite-tab-dialog-button", "Cancel");
  cancel.addEventListener("click", () => host.close());
  const buttons = document.createElement("div");
  buttons.className = "sheetwrite-tab-dialog-buttons";
  buttons.append(okButton, cancel);

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      host.close();
    } else if (event.key === "Enter" && event.target === list) {
      event.preventDefault();
      event.stopPropagation();
      ok();
    }
  });
  dialog.append(listLabel, list, copyLabel, buttons);
  return dialog;
}
