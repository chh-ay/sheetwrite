import type { Locator, Page } from "@playwright/test";

import type { Grid, KeyBindings } from "../../packages/core/src/types.js";
import { expect, fitsViewport, focusAt, nextFrames, test } from "./fixtures.js";

// The spreadsheet showcase: the shell, the ribbon, and the grid's editors and
// dialogs with each engine's real keys, focus, layout and clipboard. One boot
// per test, several checks per boot.

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
    /** Class names of shell elements Chromium reported as shifted. */
    __sheetwriteShellShifts?: string[];
    __keyBindingEvents?: KeyBindings[];
  }
}

async function open(page: Page, width = 1_600, height = 900): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
}

async function select(page: Page, reference: string): Promise<void> {
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill(reference);
  await nameBox.press("Enter");
}

function cell(page: Page, sheet: string, row: number, col: number) {
  return page.evaluate(
    ([sheetId, r, c]) => {
      const stored = window.__sheetwriteSpreadsheetGrid?.store.getCell({
        sheet: sheetId,
        row: r,
        col: c,
      });
      return { resolved: stored?.resolved ?? null, bold: stored?.style.bold === true };
    },
    [sheet, row, col] as const,
  );
}

/** Select `r0..r1` × `c0..c1` (data rows) on the active sheet and give the grid focus. */
async function selectRange(page: Page, r0: number, c0: number, r1 = r0, c1 = c0): Promise<void> {
  await page.evaluate(
    ([startRow, startCol, endRow, endCol]) => {
      const grid = window.__sheetwriteSpreadsheetGrid;
      if (!grid) throw new Error("The spreadsheet showcase has not published its grid");
      grid.setSelection({
        kind: "range",
        range: {
          sheet: grid.getActiveSheet(),
          start: { row: startRow, col: startCol },
          end: { row: endRow, col: endCol },
        },
      });
    },
    [r0, c0, r1, c1] as const,
  );
  await page.locator(".sheetwrite").first().focus();
}

/**
 * The dialog sits in the middle of the window, as Excel's do, even under the
 * docs site's `* { margin: 0 }` reset. Chromium centres it in the window less
 * the page's stable scrollbar gutter (`scrollbar-gutter: stable`), which no
 * DOM measure reports, so the centre may be up to half a scrollbar (8 px)
 * off. A dialog in the corner is hundreds of pixels off.
 */
async function expectCentred(page: Page, dialog: Locator): Promise<void> {
  const box = await dialog.boundingBox();
  if (!box) throw new Error("The dialog must have a box");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("The page must have a viewport");
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(8);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(8);
}

/** Give B2:B50 a list rule with `fields`, select B10, which shows on screen, and focus the grid. */
async function regionRule(page: Page, fields: Record<string, unknown>): Promise<void> {
  await page.evaluate((extra) => {
    const grid = window.__sheetwriteSpreadsheetGrid;
    if (!grid) throw new Error("The spreadsheet showcase has not published its grid");
    const sheet = grid.getActiveSheet();
    grid.setValidationRule({
      id: "region",
      range: { sheet, start: { row: 1, col: 1 }, end: { row: 49, col: 1 } },
      condition: { kind: "list", values: ["North", "South", "East", "West"] },
      policy: "reject",
      ...extra,
    });
    grid.setSelection({ kind: "cell", addr: { sheet, row: 9, col: 1 } });
  }, fields);
  await page.locator(".sheetwrite").first().focus();
}

/** The box of `locator` once two frames in a row show it in the same place. */
async function settledBox(page: Page, locator: Locator) {
  let box = await locator.boundingBox();
  for (;;) {
    await nextFrames(page);
    const next = await locator.boundingBox();
    if (JSON.stringify(next) === JSON.stringify(box)) return next;
    box = next;
  }
}

function regionAtB10(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid;
    return grid?.store.getCell({ sheet: grid.getActiveSheet(), row: 9, col: 1 }).resolved;
  });
}

test("Tab stays in the sheet and F6 cycles the shell's parts; the ribbon layout follows host width until the user chooses a mode", async ({
  page,
}) => {
  // Wide enough that the showcase host is above the default compact width.
  await open(page);

  // Tab moves between cells inside the grid, as in Excel, so the grid needs a
  // way out for the keyboard: F6 and Shift+F6, as Excel's F6 moves between
  // the parts of its window, and Escape then Tab.
  const shellGrid = ".sheetwrite-shell-grid";
  await select(page, "B2");
  await expect.poll(() => focusAt(page, shellGrid)).toBe("grid");
  // The grid names its way out in its description.
  await expect(page.locator(shellGrid)).toHaveAttribute("aria-description", /F6/);
  for (let press = 0; press < 3; press++) await page.keyboard.press("Tab");
  expect(await focusAt(page, shellGrid)).toBe("grid");
  for (const part of [
    ".sheetwrite-shell-tabs",
    ".sheetwrite-shell-status",
    ".sheetwrite-shell-toolbar-row",
    ".sheetwrite-shell-formula",
  ]) {
    await page.keyboard.press("F6");
    expect(await focusAt(page, shellGrid, part)).toBe("part");
  }
  await page.keyboard.press("F6");
  expect(await focusAt(page, shellGrid)).toBe("grid");
  await page.keyboard.press("Shift+F6");
  expect(await focusAt(page, shellGrid, ".sheetwrite-shell-formula")).toBe("part");
  await page.locator(shellGrid).focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  expect(await focusAt(page, shellGrid)).not.toMatch(/^(grid|inside)$/);

  const ribbon = page.getByRole("region", { name: "Ribbon" });
  await expect(ribbon).toHaveAttribute("data-mode", "full");
  const editing = page.locator('.sheetwrite-ribbon-group[aria-label="Editing"]');
  await expect(editing).toHaveAttribute("data-size", "large");
  const panel = ribbon.getByRole("tabpanel");
  const fullHeight = await panel.evaluate((element) => element.getBoundingClientRect().height);

  await page.getByRole("button", { name: "Narrow" }).click();
  await expect(ribbon).toHaveAttribute("data-mode", "compact");
  expect(await panel.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(
    fullHeight,
  );
  // At this width groups fold into dropdowns, and all those shown stay on one
  // row (any that still do not fit fold into More).
  await expect(editing).toHaveAttribute("data-size", "collapsed");
  const rows = await panel.locator(".sheetwrite-ribbon-group").evaluateAll((elements) =>
    elements.flatMap((element) => {
      const box = element.getBoundingClientRect();
      return box.height === 0 ? [] : [Math.round(box.top + box.height / 2)];
    }),
  );
  expect(rows.length).toBeGreaterThan(0);
  expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(2);
  // Editing, the last group, is one of those folded into More.
  await expect(editing).toHaveAttribute("data-overflow", "");
  await panel.getByRole("button", { name: "More groups" }).click();
  await expect(page.getByRole("button", { name: "AutoSum" })).toBeVisible();

  await page.getByRole("button", { name: "Wide" }).click();
  await expect(ribbon).toHaveAttribute("data-mode", "full");
  await expect(editing).toHaveAttribute("data-size", "large");
  // A chosen mode sticks through later width changes.
  await ribbon.getByRole("button", { name: "Compact ribbon" }).click();
  await expect(ribbon).toHaveAttribute("data-mode", "compact");
  await page.getByRole("button", { name: "Narrow" }).click();
  await page.getByRole("button", { name: "Wide" }).click();
  await expect(ribbon).toHaveAttribute("data-mode", "compact");
});

test("on a phone the ribbon arrives at its compact height and follows the site theme", async ({
  page,
}) => {
  // Chromium reports every shift with the elements that moved.
  await page.addInitScript(() => {
    interface LayoutShift extends PerformanceEntry {
      readonly sources: readonly { readonly node: Node | null }[];
    }
    const moved: string[] = [];
    window.__sheetwriteShellShifts = moved;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LayoutShift[]) {
        for (const { node } of entry.sources) {
          const element = node instanceof Element ? node : (node?.parentElement ?? null);
          if (element?.closest(".sheetwrite-shell")) moved.push(element.className);
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await open(page, 390, 844);
  await expect(page.getByRole("region", { name: "Ribbon" })).toHaveAttribute(
    "data-mode",
    "compact",
  );
  // Shifts are reported after the frame that paints them.
  await nextFrames(page);
  expect(await page.evaluate(() => window.__sheetwriteShellShifts)).toEqual([]);

  const panel = page.locator(".sheetwrite-ribbon-panel:not([hidden])");
  const background = () => panel.evaluate((element) => getComputedStyle(element).backgroundColor);
  const backgrounds: string[] = [];
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await expect.poll(background).not.toBe(backgrounds.at(-1) ?? "");
    backgrounds.push(await background());
    expect(await fitsViewport(page)).toBe(true);
  }
});

test("the Data tab's large Sort labels break between whole phrases @portability", async ({
  page,
}) => {
  await open(page, 1_440, 900);
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  await ribbon.getByRole("tab", { name: "Data", exact: true }).click();
  for (const name of ["Sort A to Z", "Sort Z to A"]) {
    const label = ribbon
      .getByRole("button", { name, exact: true })
      .locator(".sheetwrite-ribbon-label");
    // The label's text, line by line, from where each character is drawn.
    const lines = await label.evaluate((element) => {
      const text = element.firstChild;
      const content = text?.textContent ?? "";
      const range = document.createRange();
      const byTop = new Map<number, string>();
      for (let index = 0; index < content.length && text !== null; index += 1) {
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        const top = Math.round(range.getBoundingClientRect().top);
        byTop.set(top, (byTop.get(top) ?? "") + (content[index] ?? ""));
      }
      return [...byTop.values()].map((line) => line.replaceAll("\u00a0", " ").trim());
    });
    expect(lines).toEqual(["Sort", name.slice("Sort ".length)]);
  }
});

test("on a narrow phone the tabs scroll beside the layout buttons, and the full ribbon names a folded group on two lines at most @portability", async ({
  page,
}) => {
  await open(page, 320, 844);
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  const switcher = ribbon.getByRole("button", { name: "Compact ribbon" });
  const home = ribbon.getByRole("tab", { name: "Home", exact: true });
  const view = ribbon.getByRole("tab", { name: "View", exact: true });
  await home.focus();
  await home.press("End");
  await expect(view).toBeFocused();
  const tab = await view.boundingBox();
  const button = await switcher.boundingBox();
  if (tab === null || button === null) throw new Error("The View tab or layout button is hidden");
  expect(tab.x + tab.width).toBeLessThanOrEqual(button.x);
  expect(await fitsViewport(page)).toBe(true);

  if ((await switcher.getAttribute("aria-pressed")) === "true") await switcher.click();
  await expect(ribbon).toHaveAttribute("data-mode", "full");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const data = ribbon.getByRole("tab", { name: "Data", exact: true });
    if (!(await data.isVisible())) {
      await ribbon.getByRole("button", { name: "More tabs" }).click();
      await page.getByRole("menuitem", { name: "Data", exact: true }).click();
    }
    await expect(data).toHaveAttribute("aria-selected", "true");
    await nextFrames(page);

    const problems = await ribbon.evaluate((element) => {
      const panel = element.querySelector<HTMLElement>(".sheetwrite-ribbon-panel:not([hidden])");
      if (panel === null) return ["no panel"];
      const shown = (node: Element) => node.getClientRects().length > 0;
      const folded = [
        ...panel.querySelectorAll('[data-size="collapsed"] > .sheetwrite-ribbon-group-button'),
      ];
      const captions = [...panel.querySelectorAll(".sheetwrite-ribbon-group-label")].filter(shown);
      const found: string[] = [];
      if (folded.length === 0) found.push("no folded group");
      for (const groupButton of folded) {
        const name =
          groupButton.getAttribute("aria-label") ??
          groupButton.parentElement?.getAttribute("aria-label") ??
          "";
        const label = groupButton.querySelector(".sheetwrite-ribbon-label")?.firstChild;
        const range = document.createRange();
        const tops = new Set<number>();
        const text = label?.textContent ?? "";
        for (let index = 0; index < text.length && label; index += 1) {
          if (/\s/.test(text[index] ?? "")) continue;
          range.setStart(label, index);
          range.setEnd(label, index + 1);
          tops.add(Math.round(range.getBoundingClientRect().top));
        }
        if (tops.size > 2) found.push(`${name}: ${tops.size} lines`);
        const box = groupButton.getBoundingClientRect();
        for (const caption of captions) {
          const other = caption.getBoundingClientRect();
          const overlap =
            Math.min(box.right, other.right) - Math.max(box.left, other.left) > 0.5 &&
            Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 0.5;
          if (overlap) found.push(`${name} overlaps the caption ${caption.textContent}`);
        }
        const group = groupButton.parentElement?.querySelector(".sheetwrite-ribbon-group-label");
        if (group && shown(group)) found.push(`${name} still shows its caption`);
        if (box.bottom > panel.getBoundingClientRect().bottom + 0.5)
          found.push(`${name} runs past the panel`);
      }
      return found;
    });
    expect(problems, `${width} px`).toEqual([]);
  }
});

test("ribbon commands edit the workbook, AutoSum totals the ledger, and the full and compact ribbons keep tab, menu and toggle keyboard semantics @portability", async ({
  page,
}) => {
  await open(page);
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  const switcher = ribbon.getByRole("button", { name: "Compact ribbon" });
  const home = ribbon.getByRole("tab", { name: "Home", exact: true });
  const insert = ribbon.getByRole("tab", { name: "Insert", exact: true });
  const file = ribbon.getByRole("tab", { name: "File", exact: true });
  const bold = ribbon.getByRole("button", { name: "Bold", exact: true });
  const options = page.getByRole("button", { name: "Borders options" });
  const menu = page.getByRole("menu", { name: "Borders", exact: true });
  await expect(ribbon).toHaveAttribute("data-mode", "full");
  // AutoSum from the ribbon totals the ledger, which the summary sheet also totals.
  await select(page, "G50");
  await ribbon.getByRole("button", { name: "AutoSum" }).click();
  await expect(page.getByRole("textbox", { name: "Formula bar" })).toHaveValue("=SUM(G2:G49)");
  const total = await cell(page, "summary", 5, 2);
  expect((await cell(page, "sales", 49, 6)).resolved).toBeCloseTo(Number(total.resolved), 6);

  for (const mode of ["full", "compact"] as const) {
    if (mode === "compact") {
      await switcher.focus();
      await switcher.press("Space");
    }
    await expect(ribbon).toHaveAttribute("data-mode", mode);
    await expect(switcher).toHaveAttribute("aria-pressed", String(mode === "compact"));

    await home.focus();
    await home.press("ArrowRight");
    await expect(insert).toBeFocused();
    await expect(insert).toHaveAttribute("aria-selected", "true");
    // The tab list's Home key goes to its first tab, File.
    await insert.press("Home");
    await expect(file).toBeFocused();
    await file.press("ArrowRight");
    await expect(home).toBeFocused();
    await expect(home).toHaveAttribute("aria-selected", "true");

    // Space on Bold toggles B2's bold: on in the full ribbon, off in the compact one.
    const bolded = mode === "full";
    await select(page, "B2");
    if (!(await bold.isVisible())) {
      await ribbon
        .getByRole("group", { name: "Font", exact: true })
        .getByRole("button", { name: "Font", exact: true })
        .click();
    }
    await bold.focus();
    await bold.press("Space");
    await expect(bold).toHaveAttribute("aria-pressed", String(bolded));
    expect((await cell(page, "sales", 1, 1)).bold).toBe(bolded);

    await options.focus();
    await options.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Bottom Border", exact: true })).toBeFocused();
    // locator.press refocuses twice without preventScroll. That can scroll
    // WebKit's document and dismiss the fixed menu before the key is sent.
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Top Border", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(options).toBeFocused();
    await expect(options).toHaveAttribute("aria-expanded", "false");
  }
});

test("the Data tab creates a list rule from another sheet and runs the query commands, from the keyboard @portability", async ({
  page,
}) => {
  await open(page);
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  await selectRange(page, 1, 1, 49, 1);
  await ribbon.getByRole("tab", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name: "Data Validation" }).click();
  const dialog = page.getByRole("dialog", { name: "Data Validation" });
  const allow = dialog.getByLabel("Allow");
  await expect(allow).toBeFocused();
  await allow.selectOption("list");
  // The Summary sheet lists the four regions in A2:A5.
  await dialog.getByLabel("Source").fill("=Summary!$A$2:$A$5");
  await dialog.getByRole("tab", { name: "Settings" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("tab", { name: "Input Message" })).toBeFocused();
  await dialog.getByRole("tabpanel", { name: "Input Message" }).getByLabel("Title").fill("Region");
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  const rules = await page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid;
    return grid?.store.getWorkbook().sheets.find((sheet) => sheet.id === grid.getActiveSheet())
      ?.validationRules;
  });
  expect(rules).toEqual([
    expect.objectContaining({
      condition: { kind: "list", source: "=Summary!$A$2:$A$5" },
      inputTitle: "Region",
    }),
  ]);
  await selectRange(page, 1, 1);
  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText([
    "North",
    "South",
    "East",
    "West",
  ]);
  await page.keyboard.press("Escape");

  // The session connects after the shell is shown and loads the saved query's table.
  await expect.poll(async () => (await cell(page, "targets", 1, 0)).resolved).toBe("North");
  expect((await cell(page, "targets", 4, 0)).resolved).toBeNull();
  const refreshAll = ribbon.getByRole("button", { name: "Refresh All", exact: true });
  await refreshAll.focus();
  await refreshAll.press("Enter");
  const status = page.locator(".sheetwrite-action-status");
  await expect(status).toHaveText("Queries refreshed.");
  const queries = ribbon.getByRole("button", { name: "Queries & Connections", exact: true });
  await queries.focus();
  await queries.press("Enter");
  const panel = page.locator(".sheetwrite-panel");
  await expect(panel.getByText("Regional targets", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Refresh All", exact: true })).toBeVisible();
  await ribbon.getByRole("button", { name: "Get Data", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toBeFocused();
  // A read-only grid keeps the commands, and the refresh reports the rejected write.
  await page.evaluate(() => window.__sheetwriteSpreadsheetGrid?.setReadOnly(true));
  await refreshAll.click();
  await expect(status).not.toHaveText(/Queries refreshed\.|Refreshing queries/u);
});

test("sheet keys after a tab click, the name box on a filtered row, and Shift+F11 @portability", async ({
  page,
}) => {
  await open(page);
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  const formulaBar = page.getByRole("textbox", { name: "Formula bar" });
  const shown = () =>
    page.evaluate(() => {
      const grid = window.__sheetwriteSpreadsheetGrid;
      const workbook = grid?.store.getWorkbook();
      const active = workbook?.sheets.find((sheet) => sheet.id === grid?.getActiveSheet());
      return {
        sheet: active?.name,
        c5: grid?.store.getCell({ sheet: "sales", row: 4, col: 2 }).resolved,
      };
    });

  await select(page, "C5");
  await page.keyboard.type("Zed");
  await page.keyboard.press("Enter");
  await expect.poll(shown).toEqual({ sheet: "Sales", c5: "Zed" });
  // The clicked sheet shows A1 and takes the keys; undo and redo show the
  // sheet they change, as in Excel.
  await page.getByRole("tab", { name: "Summary sheet" }).click();
  await expect(nameBox).toHaveValue("A1");
  await page.keyboard.press("Control+Z");
  await expect.poll(shown).toEqual({ sheet: "Sales", c5: "Devon" });
  await expect(nameBox).toHaveValue("C5");
  await page.getByRole("tab", { name: "Summary sheet" }).click();
  await page.keyboard.press("Control+Y");
  await expect.poll(shown).toEqual({ sheet: "Sales", c5: "Zed" });
  await expect(nameBox).toHaveValue("C5");

  // Keep only the orders of 1/2/2026: sheet rows 3 to 49 hide. The name box
  // still goes to C5, and typing edits the hidden cell in the formula bar.
  await select(page, "A1");
  await page.keyboard.press("ControlOrMeta+Shift+L");
  await page.evaluate(() => {
    window.__sheetwriteSpreadsheetGrid?.setColumnFilter(0, { kind: "values", values: [46024] });
  });
  await select(page, "C5");
  await expect(nameBox).not.toHaveAttribute("aria-invalid", "true");
  await expect(nameBox).toHaveValue("C5");
  await expect(formulaBar).toHaveValue("Zed");
  await page.keyboard.type("Zoe");
  await expect(formulaBar).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await shown()).c5).toBe("Zoe");
  // Down goes to the next row that shows: the empty row below the orders.
  await select(page, "C5");
  await page.keyboard.press("ArrowDown");
  await expect(nameBox).toHaveValue("C50");

  // Shift+F11 inserts Excel's SheetN before the active sheet, the add button after it.
  const sheets = () =>
    page.evaluate(() => {
      const grid = window.__sheetwriteSpreadsheetGrid;
      const workbook = grid?.store.getWorkbook();
      const active = workbook?.sheets.find((sheet) => sheet.id === grid?.getActiveSheet());
      return { names: workbook?.sheets.map((sheet) => sheet.name), active: active?.name };
    });
  await select(page, "A1");
  await page.keyboard.press("Shift+F11");
  await expect
    .poll(sheets)
    .toEqual({ names: ["Sheet4", "Sales", "Summary", "Targets"], active: "Sheet4" });
  await page.getByRole("button", { name: "Add sheet", exact: true }).click();
  await expect
    .poll(sheets)
    .toEqual({ names: ["Sheet4", "Sheet5", "Sales", "Summary", "Targets"], active: "Sheet5" });
  // An empty sheet with columns A to Z: the name box takes Z1.
  await select(page, "Z1");
  await expect(nameBox).not.toHaveAttribute("aria-invalid", "true");
});

test("the cell editor and the formula bar: result preview, one shared draft, multi-line source, AutoComplete and validation lists, validation alerts @portability", async ({
  page,
}) => {
  await open(page);
  const bar = page.getByRole("textbox", { name: "Formula bar" });
  const cellEditor = page.locator("textarea.sheetwrite-editor");
  const formulaInG3 = () =>
    page.evaluate(() =>
      window.__sheetwriteSpreadsheetGrid?.store.getFormula({ sheet: "sales", row: 2, col: 6 }),
    );

  // Formula help previews the result while typing and leaves the cell
  // unchanged. G3 holds =E3*F3; typing replaces it in the editor only.
  await select(page, "G3");
  const storedFormula = await formulaInG3();
  await page.keyboard.type("=E3*F3+0");
  const preview = page.locator(".sheetwrite-formula-preview");
  await expect(preview).toHaveText("= 719.91");
  await expect(cellEditor).toHaveAttribute(
    "aria-describedby",
    new RegExp(`\\b${(await preview.getAttribute("id")) ?? "missing"}\\b`),
  );
  // An unfinished formula has no preview; its error waits in the guide.
  await cellEditor.fill("=ROUND(E3*F3,");
  await expect(preview).toHaveText("");
  await cellEditor.fill("=SEQUENCE(2,3,5)");
  await expect(preview).toHaveText("= 5 … (2 × 3 array)");
  await cellEditor.fill("=E3*RAND()");
  await expect(preview).toHaveText(/^No preview/u);
  await cellEditor.press("Escape");
  await expect(cellEditor).toHaveCount(0);
  expect(await formulaInG3()).toBe(storedFormula);

  // The formula bar follows every keystroke in the cell editor, and Escape restores both.
  await select(page, "G3");
  const storedText = await bar.inputValue();
  await page.keyboard.type("=SU");
  await expect(cellEditor).toBeFocused();
  await expect(bar).toHaveValue("=SU");
  await page.keyboard.type("M(1,");
  await expect(bar).toHaveValue("=SUM(1,");
  await page.keyboard.press("Alt+Enter");
  await page.keyboard.type("2)");
  await expect(bar).toHaveValue("=SUM(1,\n2)");
  await page.keyboard.press("Backspace");
  await expect(bar).toHaveValue("=SUM(1,\n2");
  await page.keyboard.press("Escape");
  await expect(cellEditor).toHaveCount(0);
  await expect(bar).toHaveValue(storedText);

  // The cell shows every keystroke typed in the formula bar; moving into the
  // cell editor keeps the edit, and Enter in the bar commits it.
  await select(page, "G4");
  await bar.click();
  await bar.press("ControlOrMeta+a");
  await page.keyboard.type("Draft");
  await expect(cellEditor).toHaveValue("Draft");
  await expect(bar).toBeFocused();
  await page.keyboard.type(" text");
  await expect(cellEditor).toHaveValue("Draft text");
  await cellEditor.click();
  await expect(cellEditor).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect(bar).toHaveValue("Draft text!");
  await bar.click();
  await page.keyboard.press("Enter");
  await expect(cellEditor).toHaveCount(0);
  await expect(bar).toHaveValue("Draft text!");

  // Formula help: the function list, the argument guide and the coloured layer.
  const source = "=ROUND(\nSUM(A1:A3),\n2)";
  const guide = page.getByRole("status").filter({ hasText: "ROUND(" });
  const formulaList = page.getByRole("listbox", { name: "Formula AutoComplete" });
  const mirror = page.locator(".sheetwrite-formula-mirror");

  // The cell editor lists functions; a real Enter picks one without a line
  // break, and the help follows the arguments.
  await select(page, "G3");
  await page.keyboard.type("=ROU");
  await expect(formulaList.getByRole("option", { name: "ROUND", exact: true })).toBeVisible();
  await expect(cellEditor).toHaveAttribute(
    "aria-controls",
    (await formulaList.getAttribute("id")) ?? "",
  );
  await page.keyboard.press("Enter");
  await expect(cellEditor).toHaveValue("=ROUND(");
  await expect(formulaList).toHaveCount(0);
  await expect(guide.locator("strong")).toHaveText("number");
  await page.keyboard.type("A1:A3, ");
  await expect(guide.locator("strong")).toHaveText("num_digits");
  await page.keyboard.type("2");
  await page.keyboard.press("Enter");
  await expect(cellEditor).toHaveCount(0);

  // Each formula editor inserts lines, keeps its help and coloured layer
  // aligned, and commits the multi-line source.
  for (const [kind, editor] of [
    ["cell", cellEditor],
    ["bar", bar],
  ] as const) {
    // F2 opens Edit mode, where arrow keys move the caret instead of committing.
    await select(page, "G3");
    if (kind === "cell") await page.keyboard.press("F2");
    await editor.fill("=ROUND(");
    const initialHeight = await editor.evaluate((field) => field.getBoundingClientRect().height);
    await expect(guide.locator("strong")).toHaveText("number");
    await editor.press("Alt+Enter");
    await expect(editor).toHaveValue("=ROUND(\n");
    await expect(editor).toBeFocused();
    await expect(editor).toHaveAttribute("aria-multiline", "true");
    expect(await editor.evaluate((field) => field.getBoundingClientRect().height)).toBeGreaterThan(
      initialHeight,
    );
    expect(await editor.getAttribute("role")).not.toBe("combobox");
    await page.keyboard.type("SUM");
    await expect(formulaList.getByRole("option", { name: "SUM", exact: true })).toBeVisible();
    // Alt+Enter must not accept the open completion.
    await editor.press("Alt+Enter");
    await expect(editor).toHaveValue("=ROUND(\nSUM\n");
    await page.keyboard.press("Backspace");
    await expect(formulaList.getByRole("option", { name: "SUM", exact: true })).toBeVisible();
    await editor.press("Tab");
    await expect(editor).toHaveValue("=ROUND(\nSUM(");
    await page.keyboard.type("A1:A3),");
    await editor.press("Alt+Enter");
    await page.keyboard.type("2)");
    await page.keyboard.press("ArrowLeft");
    await expect(guide.locator("strong")).toHaveText("num_digits");
    await expect(mirror).toHaveText(source);
    const geometry = await editor.evaluate((field) => {
      const layer = document.querySelector(".sheetwrite-formula-mirror");
      if (!layer) throw new Error("Formula text mirror is missing");
      const editorBox = field.getBoundingClientRect();
      const layerBox = layer.getBoundingClientRect();
      const reference = [...layer.querySelectorAll("span")].find(
        (span) => span.textContent === "A1:A3",
      );
      if (!reference) throw new Error("Coloured reference is missing");
      return {
        editor: [editorBox.x, editorBox.y, editorBox.width, editorBox.height],
        mirror: [layerBox.x, layerBox.y, layerBox.width, layerBox.height],
        lineHeight: getComputedStyle(field).lineHeight,
        mirrorLineHeight: getComputedStyle(layer).lineHeight,
        referenceY: reference.getBoundingClientRect().y,
        referenceColor: reference.style.color,
      };
    });
    expect(geometry.mirror).toEqual(geometry.editor);
    expect(geometry.mirrorLineHeight).toBe(geometry.lineHeight);
    expect(geometry.referenceY).toBeGreaterThan(geometry.editor[1] ?? 0);
    expect(geometry.referenceColor).not.toBe("");
    await editor.press("Enter");
    await expect.poll(formulaInG3).toBe(source);
    // Reopening retains line breaks; removing them shrinks the editor again.
    await select(page, "G3");
    if (kind === "cell") await page.keyboard.press("F2");
    await expect(editor).toHaveValue(source);
    // A selection is replaced, not surrounded, when inserting a line.
    await editor.focus();
    await editor.evaluate((field) => {
      if (!(field instanceof HTMLTextAreaElement))
        throw new Error("Formula editor is not a textarea");
      const digit = field.value.lastIndexOf("2");
      field.setSelectionRange(digit, digit + 1);
    });
    await editor.press("Alt+Enter");
    await expect(editor).toHaveValue("=ROUND(\nSUM(A1:A3),\n\n)");
    // Long drafts stay bounded and their coloured layer follows vertical scroll.
    await editor.fill(`=SUM(\n${Array.from({ length: 12 }, () => "1,").join("\n")}\n2)`);
    await editor.evaluate((field) => {
      field.scrollTop = field.scrollHeight;
    });
    await expect
      .poll(() =>
        editor.evaluate((field) => {
          const layer = document.querySelector(".sheetwrite-formula-mirror");
          return field.scrollTop > 0 && layer?.scrollTop === field.scrollTop;
        }),
      )
      .toBe(true);
    await editor.fill("=42");
    expect(await editor.evaluate((field) => field.getBoundingClientRect().height)).toBe(
      initialHeight,
    );
    await editor.press("Escape");
    expect(await formulaInG3()).toBe(source);
  }

  // Pick From Drop-down List under the Region column, with the real Alt (Option
  // on a Mac) and arrow keys; the header is a text entry too, as in Excel.
  await select(page, "B50");
  await page.keyboard.press("Alt+ArrowDown");
  const pick = page.getByRole("listbox", { name: "Pick From Drop-down List" });
  await expect(pick.getByRole("option")).toHaveText(["East", "North", "Region", "South", "West"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(pick).toHaveCount(0);
  await expect.poll(async () => (await cell(page, "sales", 49, 1)).resolved).toBe("North");
  // B50 is the sheet's last row. With Northeast there, two entries begin "Nor"
  // for B49: AutoComplete lists them and completes nothing inline.
  await select(page, "B50");
  await page.keyboard.type("Northeast");
  await page.keyboard.press("Enter");
  await select(page, "B49");
  await page.keyboard.type("Nor");
  const listed = page.getByRole("listbox", { name: "AutoComplete" });
  await expect(listed.getByRole("option")).toHaveText(["North", "Northeast"]);
  await expect(cellEditor).toHaveValue("Nor");
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await cell(page, "sales", 48, 1)).resolved).toBe("Northeast");

  // Data validation: Excel's error alerts and a list cell's dropdown, with
  // each engine's real focus order, give the grid its focus back.
  const gridHost = page.locator(".sheetwrite").first();
  // The name box scrolls B10 back on screen, where its input message shows.
  await select(page, "B10");
  // Stop: Retry is focused, Tab and Shift+Tab move inside the alert, Enter
  // retries in the cell editor, and Escape cancels the entry.
  await regionRule(page, { inputTitle: "Region", inputMessage: "Pick a sales region." });
  await expect(page.locator(".sheetwrite-input-message")).toHaveText("RegionPick a sales region.");
  const before = await regionAtB10(page);
  await page.keyboard.type('="Nowhere"');
  await page.keyboard.press("Enter");
  const stop = page.getByRole("alertdialog", { name: "Data Validation" });
  await expect(stop).toContainText(
    "This value doesn't match the data validation restrictions defined for this cell.",
  );
  await expect(stop.getByRole("button", { name: "Retry" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(stop.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(stop).toHaveCount(0);
  await expect(cellEditor).toBeFocused();
  await expect(cellEditor).toHaveValue('="Nowhere"');
  await page.keyboard.press("Enter");
  await expect(stop).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(stop).toHaveCount(0);
  await expect(gridHost).toBeFocused();
  expect(await regionAtB10(page)).toEqual(before);

  // Warning: No is focused, and Yes keeps the entry; Information: OK keeps it.
  await regionRule(page, { policy: "warn", errorTitle: "Region", helpText: "Not a region." });
  await page.keyboard.type("Nowhere");
  await page.keyboard.press("Enter");
  const warning = page.getByRole("alertdialog", { name: "Region" });
  await expect(warning).toContainText("Not a region.Continue?");
  await expect(warning.getByRole("button", { name: "No" })).toBeFocused();
  await warning.getByRole("button", { name: "Yes" }).click();
  await expect(warning).toHaveCount(0);
  expect(await regionAtB10(page)).toBe("Nowhere");
  await regionRule(page, { policy: "warn", errorStyle: "information" });
  await page.keyboard.type("Elsewhere");
  await page.keyboard.press("Enter");
  const information = page.getByRole("alertdialog", { name: "Data Validation" });
  await expect(information.getByRole("button", { name: "OK" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(information).toHaveCount(0);
  expect(await regionAtB10(page)).toBe("Elsewhere");

  // A list cell: a pointer press on its arrow opens the list, Escape closes
  // it, typing filters it, and Alt+Down then Tab opens and closes it.
  await regionRule(page, {
    condition: {
      kind: "list",
      values: ["North", "South", "East", "West", "North-East", "South-West"],
    },
  });
  const arrow = page.locator(".sheetwrite-list-button");
  await expect(arrow).toBeVisible();
  // The overlay paints the arrow on the next frames after the selection moved;
  // read its box once two frames show it in the same place.
  const arrowBox = await settledBox(page, arrow);
  if (!arrowBox) throw new Error("expected the dropdown arrow");
  await page.mouse.click(arrowBox.x + arrowBox.width / 2, arrowBox.y + arrowBox.height / 2);
  const choices = page.getByRole("listbox");
  await expect(choices.getByRole("option")).toHaveCount(6);
  await page.keyboard.press("Escape");
  await expect(choices).toHaveCount(0);
  await expect(gridHost).toBeFocused();
  await page.keyboard.type("we");
  const combobox = page.locator(".sheetwrite-validation-input");
  await expect(combobox).toBeFocused();
  await expect(combobox).toHaveValue("we");
  await expect(choices.getByRole("option")).toHaveText(["West", "South-West"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(choices).toHaveCount(0);
  expect(await regionAtB10(page)).toBe("South-West");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Alt+ArrowDown");
  await expect(choices.getByRole("option")).toHaveCount(6);
  await page.keyboard.press("Tab");
  await expect(choices).toHaveCount(0);
});

test("Excel's keys reach the grid and its dialogs: cut and paste, formats, hide, merge, Paste Special, Find, shortcuts @portability", async ({
  page,
  browserName,
}) => {
  // Playwright grants Chromium both clipboard permissions and WebKit the read
  // one; Firefox lets a page use the clipboard after a key press.
  const permissions: Record<string, string[]> = {
    chromium: ["clipboard-read", "clipboard-write"],
    webkit: ["clipboard-read"],
  };
  await page.context().grantPermissions(permissions[browserName] ?? []);
  await open(page);
  const grid = page.locator(".sheetwrite").first();
  /** The workbook state each step checks, on the active sheet. */
  const sheetState = () =>
    page.evaluate(() => {
      const shown = window.__sheetwriteSpreadsheetGrid;
      if (!shown) throw new Error("The spreadsheet showcase has not published its grid");
      const sheet = shown.getActiveSheet();
      const value = (row: number, col: number) => shown.store.getCell({ sheet, row, col }).resolved;
      const meta = shown.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
      return {
        moved: { source: [value(2, 0), value(3, 0)], target: [value(2, 3), value(3, 3)] },
        movedFormula: shown.store.getFormula({ sheet, row: 2, col: 2 }),
        format: shown.store.getCell({ sheet, row: 5, col: 0 }).style.numberFormat ?? null,
        rows: [...shown.hiddenRows()],
        columns: [...shown.hiddenColumns()],
        merges: (meta?.merges ?? []).filter((merge) => merge.r0 === 5).length,
        covered: value(5, 1),
        added: [value(39, 2), value(40, 2)],
      };
    });
  await page.evaluate(() => {
    const shown = window.__sheetwriteSpreadsheetGrid;
    if (!shown) throw new Error("The spreadsheet showcase has not published its grid");
    const sheet = shown.getActiveSheet();
    const literal = (row: number, col: number, value: number | string) => ({
      op: "set" as const,
      addr: { sheet, row, col },
      value: { kind: "literal" as const, value },
    });
    shown.applyTransaction({
      patches: [
        literal(2, 0, 10),
        literal(3, 0, 20),
        { op: "set", addr: { sheet, row: 2, col: 2 }, value: { kind: "formula", src: "=A3+A4" } },
        literal(5, 0, 1234.5),
        literal(5, 1, "m2"),
        literal(39, 0, 10),
        literal(40, 0, 20),
        literal(39, 2, 1),
        literal(40, 2, 2),
      ],
    });
  });

  // #921: cut and paste moves the cells and the references to them in every
  // engine; Firefox and WebKit keep only plain text and HTML on the clipboard.
  // https://support.microsoft.com/en-us/office/move-or-copy-cells-and-cell-contents-803d65eb-6a3e-4534-8c6f-ff12d1c4139e
  await selectRange(page, 2, 0, 3, 0);
  await page.keyboard.press("ControlOrMeta+x");
  await expect(page.locator("[data-sheetwrite-cut]").first()).toBeVisible();
  expect((await sheetState()).moved.source).toEqual([10, 20]);
  await selectRange(page, 2, 3);
  await page.keyboard.press("ControlOrMeta+v");
  await expect
    .poll(
      async () => {
        const { moved, movedFormula } = await sheetState();
        return { ...moved, movedFormula };
      },
      { timeout: 15_000 },
    )
    .toEqual({ source: [null, null], target: [10, 20], movedFormula: "=D3+D4" });
  await expect(page.locator("[data-sheetwrite-cut]")).toHaveCount(0);

  // Format, hide and unhide keys.
  await selectRange(page, 5, 0);
  await page.keyboard.press("Control+Shift+Digit4");
  await expect.poll(async () => (await sheetState()).format).toBe("$#,##0.00_);($#,##0.00)");
  await page.keyboard.press("Control+Shift+Backquote");
  await expect.poll(async () => (await sheetState()).format).toBe("General");
  await page.keyboard.press("Control+Digit9");
  await expect.poll(async () => (await sheetState()).rows).toEqual([5]);
  await selectRange(page, 4, 0, 6, 0);
  await page.keyboard.press("Control+Shift+Digit9");
  await expect.poll(async () => (await sheetState()).rows).toEqual([]);
  await selectRange(page, 5, 1);
  await page.keyboard.press("Control+Digit0");
  await expect.poll(async () => (await sheetState()).columns).toEqual([1]);
  await selectRange(page, 5, 0, 5, 2);
  await page.keyboard.press("Control+Shift+Digit0");
  await expect.poll(async () => (await sheetState()).columns).toEqual([]);

  // Insert, Delete and Format Cells open centred and give the grid its focus back.
  for (const [key, name] of [
    ["Control+Shift+Equal", "Insert"],
    ["Control+Minus", "Delete"],
    ["Control+Digit1", "Format Cells"],
  ] as const) {
    await selectRange(page, 5, 0, 5, 1);
    await page.keyboard.press(key);
    const dialog = page.getByRole("dialog", { name, exact: true });
    await expect(dialog).toBeVisible();
    await expectCentred(page, dialog);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(grid).toBeFocused();
  }

  // Merging cells that hold two values warns first: OK is focused, Tab
  // cycles inside the alert, Escape cancels and Enter merges.
  await selectRange(page, 5, 0, 5, 1);
  await page.evaluate(() =>
    window.__sheetwriteSpreadsheetGrid?.actions.mergeAndCenter({ ask: true }),
  );
  const warning = page.getByRole("alertdialog", { name: "Merge Cells" });
  await expectCentred(page, warning);
  await expect(warning).toContainText(
    "Merging cells only keeps the upper-left value and discards other values. This value will be discarded: B6: 'm2'.",
  );
  const ok = warning.getByRole("button", { name: "OK" });
  const cancel = warning.getByRole("button", { name: "Cancel" });
  await expect(ok).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(ok).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(warning).toHaveCount(0);
  await expect(grid).toBeFocused();
  expect(await sheetState()).toMatchObject({ merges: 0, covered: "m2" });
  await page.evaluate(() =>
    window.__sheetwriteSpreadsheetGrid?.actions.mergeAndCenter({ ask: true }),
  );
  await expect(ok).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(warning).toHaveCount(0);
  await expect.poll(async () => (await sheetState()).merges).toBe(1);
  expect((await sheetState()).covered).toBeNull();

  // Ctrl+Alt+V opens Paste Special, whose letter keys choose.
  // https://support.microsoft.com/en-us/excel/paste-options
  await selectRange(page, 39, 0, 40, 0);
  await page.keyboard.press("Control+Alt+KeyV");
  const pasteSpecial = page.getByRole("dialog", { name: "Paste Special" });
  const all = pasteSpecial.getByRole("radio", { name: "All", exact: true });
  await expect(all).toBeFocused();
  await expect(all).toBeChecked();
  await page.keyboard.press("v");
  await expect(pasteSpecial.getByRole("radio", { name: "Values", exact: true })).toBeChecked();
  await page.keyboard.press("d");
  await expect(pasteSpecial.getByRole("radio", { name: "Add", exact: true })).toBeChecked();
  await page.keyboard.press("e");
  await expect(pasteSpecial.getByRole("checkbox", { name: "Transpose" })).toBeChecked();
  // Formats has no operation, as in Excel.
  await page.keyboard.press("t");
  await expect(pasteSpecial.getByRole("radio", { name: "Formats", exact: true })).toBeChecked();
  await expect(pasteSpecial.getByRole("radio", { name: "Add", exact: true })).toBeDisabled();
  await expect(pasteSpecial.getByRole("radio", { name: "None", exact: true })).toBeChecked();
  await expect(pasteSpecial.getByRole("button", { name: "Paste Link" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(pasteSpecial).toHaveCount(0);
  await expect(grid).toBeFocused();

  // The context menu's Paste Options row: Up and Down treat the row as one
  // stop, Left and Right move inside it, and Paste Special… opens the dialog.
  const scroller = await page.locator(".sheetwrite-scroller").first().boundingBox();
  if (!scroller) throw new Error("Missing grid scroller");
  await page.mouse.click(scroller.x + 120, scroller.y + 120, { button: "right" });
  const menu = page.locator(".sheetwrite-context-menu").first();
  const pasteOptions = menu.getByRole("group", { name: "Paste Options" });
  for (const name of ["Paste", "Values", "Formulas", "Transpose", "Formatting", "Paste Link"]) {
    await expect(pasteOptions.getByRole("menuitem", { name, exact: true })).toBeVisible();
  }
  await menu.getByRole("menuitem", { name: "Copy" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(pasteOptions.getByRole("menuitem", { name: "Paste", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(pasteOptions.getByRole("menuitem", { name: "Values", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: /^Paste Special…/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(pasteSpecial).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pasteSpecial).toHaveCount(0);

  // Paste Special adds the copied values, read from the real clipboard after
  // OK. Only Chromium grants this page clipboard read without a gesture.
  if (browserName === "chromium") {
    await selectRange(page, 39, 0, 40, 0);
    await page.keyboard.press("Control+c");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15_000 })
      .toContain("10");
    await selectRange(page, 39, 2);
    await page.keyboard.press("Control+Alt+KeyV");
    await expect(pasteSpecial).toBeVisible();
    await page.keyboard.press("v");
    await page.keyboard.press("d");
    await expect(pasteSpecial.getByRole("radio", { name: "Add", exact: true })).toBeChecked();
    await pasteSpecial.getByRole("button", { name: "OK" }).click();
    await expect(pasteSpecial).toHaveCount(0);
    await expect
      .poll(async () => (await sheetState()).added, { timeout: 15_000 })
      .toEqual([11, 22]);
  }

  // Format Cells fits a short or narrow window: its body scrolls, and OK and
  // Cancel stay in view.
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1_280, height: 400 },
  ]) {
    await page.setViewportSize(viewport);
    await selectRange(page, 1, 6);
    await page.keyboard.press("Control+Digit1");
    const dialog = page.getByRole("dialog", { name: "Format Cells", exact: true });
    await expect(dialog).toBeVisible();
    await expectCentred(page, dialog);
    const box = await dialog.boundingBox();
    if (!box) throw new Error("Format Cells must have a box");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    for (const name of ["OK", "Cancel"]) {
      const button = dialog.getByRole("button", { name, exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      const buttonBox = await button.boundingBox();
      if (!buttonBox) throw new Error(`${name} must have a box`);
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(box.y + box.height);
    }
    await dialog.getByRole("button", { name: "OK", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await page.setViewportSize({ width: 1_600, height: 900 });

  // Find's Options and Find All search the workbook from Excel's Alt access
  // keys (Option on a Mac), and a result goes to its sheet.
  const second = await page.evaluate(() => {
    const shown = window.__sheetwriteSpreadsheetGrid;
    if (!shown) throw new Error("The spreadsheet showcase has not published its grid");
    const [first = "", other = ""] = shown.store
      .getWorkbook()
      .sheets.filter((sheet) => (sheet.visibility ?? "visible") === "visible")
      .map((sheet) => sheet.id);
    shown.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: first, row: 0, col: 0 },
          value: { kind: "literal", value: "zq-marker" },
        },
        {
          op: "set",
          addr: { sheet: other, row: 1, col: 1 },
          value: { kind: "literal", value: "ZQ-MARKER" },
        },
      ],
    });
    shown.setActiveSheet(first);
    shown.setSelection({ kind: "cell", addr: { sheet: first, row: 3, col: 3 } });
    return other;
  });
  await grid.focus();
  await page.keyboard.press("ControlOrMeta+f");
  const find = page.getByRole("textbox", { name: "Find in sheet" });
  await expect(find).toBeFocused();
  await find.fill("zq-marker");
  const count = page.locator(".sheetwrite-find-count");
  await expect(count).toHaveText("1 of 1");
  // Alt+H shows the options and focuses Within, as in Excel's dialog.
  await page.keyboard.press("Alt+h");
  const within = page.locator(".sheetwrite-find-options select").first();
  await expect(within).toBeFocused();
  await within.selectOption("workbook");
  await expect(count).toHaveText(/ of 2$/);
  // Alt+C ticks Match case: only the lower-case marker is left.
  await page.keyboard.press("Alt+c");
  await expect(count).toHaveText("1 of 1");
  await page.keyboard.press("Alt+c");
  await expect(count).toHaveText(/ of 2$/);
  await page.keyboard.press("Alt+i");
  const results = page.getByRole("listbox", { name: "Find all results" });
  await expect(results.getByRole("option")).toHaveCount(2);
  await expect(
    page.locator(".sheetwrite-find-all-results .sheetwrite-find-results-status"),
  ).toHaveText("2 cells found");
  await results.getByRole("option").nth(1).click();
  await expect
    .poll(() => page.evaluate(() => window.__sheetwriteSpreadsheetGrid?.getActiveSheet()))
    .toBe(second);
  expect(await page.evaluate(() => window.__sheetwriteSpreadsheetGrid?.getSelection())).toEqual({
    kind: "cell",
    addr: { sheet: second, row: 1, col: 1 },
  });

  // #802: the Keyboard shortcuts panel finds a command by its pressed keys,
  // records new keys for Bold, and the new keys bold the active cell at once.
  // The modifier the page treats as Mod: ⌘ where it reports an Apple platform, else Ctrl.
  const mod = await page.evaluate(() => {
    const shown = window.__sheetwriteSpreadsheetGrid;
    if (!shown) throw new Error("The spreadsheet showcase has not published its grid");
    // The shell's grid has no chrome of its own; keep it that way.
    shown.setConfig({ toolbar: false, tabs: false, keyboardSettings: true });
    const events: KeyBindings[] = [];
    window.__keyBindingEvents = events;
    shown.on("key-bindings-change", ({ bindings }) => events.push(bindings));
    const apple = /Mac|iPhone|iPad|iPod/i;
    return apple.test(navigator.platform) || apple.test(navigator.userAgent) ? "Meta" : "Control";
  });
  await grid.focus();
  await page.evaluate(() => window.__sheetwriteSpreadsheetGrid?.openKeyboardSettings());
  const panel = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(panel).toBeVisible();
  const search = panel.getByRole("searchbox", { name: "Search commands or press keys" });
  await expect(search).toBeFocused();
  await page.keyboard.press(`${mod}+Shift+L`);
  await expect(panel.locator("tr[data-action]:visible")).toHaveCount(1);
  await expect(panel.locator('tr[data-action="toggleFilter"]')).toBeVisible();
  await search.fill("bold");
  const boldLabel = await page.evaluate(() =>
    window.__sheetwriteSpreadsheetGrid?.getShortcutLabel("bold"),
  );
  await panel.getByRole("button", { name: `Change ${boldLabel} for Bold` }).click();
  await expect(panel.getByRole("status")).toHaveText(
    "Recording keys for Bold. Press the new keys, or Escape to cancel.",
  );
  await page.keyboard.press(`${mod}+Alt+K`);
  await expect(panel.getByRole("status")).toContainText("Bold now uses");
  expect(await page.evaluate(() => window.__keyBindingEvents)).toEqual([
    { bold: ["Mod+Alt+K", "Mod+2"] },
  ]);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(grid).toBeFocused();
  await page.keyboard.press(`${mod}+Alt+K`);
  await expect
    .poll(() => page.evaluate(() => window.__sheetwriteSpreadsheetGrid?.getFocusCellStyle().bold))
    .toBe(true);
});
