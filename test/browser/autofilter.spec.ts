import type { Page } from "@playwright/test";

import type { ColumnFilter } from "../../packages/core/src/types.js";
import { expect, nextFrames, test } from "./fixtures.js";

// #735: Excel's AutoFilter, driven through the header buttons, the dropdown
// and the keyboard on the Vue workbench's grid.

const SHEET = "autofilter";
const ROWS: (string | number)[][] = [
  ["Item", "Qty"],
  ["apple", 3],
  ["Apricot", 12],
  ["banana", 7],
  ["fig", 20],
  ["grape", 12],
];

/** A sheet of a header and five items, active and with B2 selected. */
async function open(page: Page) {
  await page.goto("/vue/");
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__sheetwriteVueWorkbench?.grid)))
    .toBe(true);
  await page.evaluate(
    ([sheet, rows]) => {
      const grid = window.__sheetwriteVueWorkbench?.grid;
      if (!grid) throw new Error("Vue grid is unavailable");
      grid.addSheet({
        id: sheet,
        name: "Filter",
        rowCount: 20,
        columns: [
          { key: "item", header: "Item", width: 120, type: "text" },
          { key: "qty", header: "Qty", width: 80, type: "number" },
        ],
      });
      grid.setActiveSheet(sheet);
      grid.applyTransaction({
        patches: rows.flatMap((row, r) =>
          row.map((value, col) => ({
            op: "set" as const,
            addr: { sheet, row: r, col },
            value: { kind: "literal" as const, value },
          })),
        ),
      });
      grid.setSelection({ kind: "cell", addr: { sheet, row: 1, col: 1 } });
    },
    [SHEET, ROWS] as const,
  );
  await page.locator(".sw-demo-grid .sheetwrite").focus();
}

const grid = (page: Page) => page.locator(".sw-demo-grid .sheetwrite");
const buttons = (page: Page) => page.locator(".sw-demo-grid .sheetwrite-autofilter-button");
/** The glyphs drawn over the buttons, from the icon sheet. */
const buttonGlyphs = (page: Page) =>
  page.locator(".sw-demo-grid .sheetwrite-autofilter-glyph.sheetwrite-icon");
const dropdown = (page: Page, header: string) =>
  page.getByRole("dialog", { name: `Filter ${header}` });

function filters(page: Page): Promise<[number, ColumnFilter][]> {
  return page.evaluate(() => [...(window.__sheetwriteVueWorkbench?.grid.getColumnFilters() ?? [])]);
}

/** The Item column's text of every shown row, from the store's view. */
function shownItems(page: Page): Promise<unknown[]> {
  return page.evaluate((sheet) => {
    const store = window.__sheetwriteVueWorkbench?.grid.store;
    if (!store || !("viewRowCount" in store)) throw new Error("no store view");
    const view = store as unknown as {
      viewRowCount(sheet: string): number;
      dataRowAt(sheet: string, row: number): number;
      getCell(addr: { sheet: string; row: number; col: number }): { resolved: unknown };
    };
    const items: unknown[] = [];
    for (let row = 0; row < view.viewRowCount(sheet); row++) {
      const value = view.getCell({ sheet, row: view.dataRowAt(sheet, row), col: 0 }).resolved;
      if (value !== null) items.push(value);
    }
    return items;
  }, SHEET);
}

/** Click the filter button of header column `col` (0 or 1). */
async function clickButton(page: Page, col: number) {
  await nextFrames(page);
  const box = await buttons(page).nth(col).boundingBox();
  if (!box) throw new Error(`no filter button for column ${col}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test("Ctrl+Shift+L turns the filter buttons on for the current region and off again", async ({
  page,
}) => {
  await open(page);
  await grid(page).press("ControlOrMeta+Shift+L");
  await expect(buttons(page)).toHaveCount(2);
  await expect(buttons(page).first()).toHaveAttribute("data-filtered", "false");
  await expect(buttonGlyphs(page).first()).toHaveAttribute("data-icon", "filterArrow");
  await grid(page).press("ControlOrMeta+Shift+L");
  await expect(buttons(page)).toHaveCount(0);
  await expect(buttonGlyphs(page)).toHaveCount(0);
});

test("a value filter from the dropdown hides the unticked rows; the header stays", async ({
  page,
}) => {
  await open(page);
  await grid(page).press("ControlOrMeta+Shift+L");
  await clickButton(page, 0);

  const dialog = dropdown(page, "Item");
  await expect(dialog).toBeVisible();
  const list = dialog.getByRole("listbox", { name: "Values of Item" });
  await list.getByRole("option", { name: "banana" }).click();
  await list.getByRole("option", { name: "fig" }).click();
  await dialog.getByRole("button", { name: "OK" }).click();

  await expect(dialog).toBeHidden();
  await expect.poll(() => shownItems(page)).toEqual(["Item", "apple", "Apricot", "grape"]);
  await expect(buttons(page).first()).toHaveAttribute("data-filtered", "true");
  await expect(buttonGlyphs(page).first()).toHaveAttribute("data-icon", "filterActive");
  // The header cell keeps the selection, as in Excel.
  await expect
    .poll(() => page.evaluate(() => window.__sheetwriteVueWorkbench?.grid.getSelection()))
    .toEqual({ kind: "cell", addr: { sheet: SHEET, row: 0, col: 0 } });

  // Undo brings the rows back; redo hides them again.
  await grid(page).press("ControlOrMeta+z");
  await expect.poll(() => shownItems(page)).toHaveLength(ROWS.length);
  await grid(page).press("ControlOrMeta+Shift+z");
  await expect.poll(() => shownItems(page)).toHaveLength(4);
});

test("a Number Filters condition and Clear Filter From, from the keyboard", async ({ page }) => {
  await open(page);
  await grid(page).press("ControlOrMeta+Shift+L");
  // B1 is the Qty header: Alt+Down opens its dropdown.
  await grid(page).press("ArrowUp");
  await grid(page).press("Alt+ArrowDown");
  const dialog = dropdown(page, "Qty");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Number Filters" }).click();
  await dialog.getByRole("menuitem", { name: "Greater Than…" }).click();
  const form = dialog.getByRole("form", { name: "Custom AutoFilter for Qty" });
  await form.getByRole("textbox", { name: "Value 1" }).fill("10");
  await form.getByRole("textbox", { name: "Value 1" }).press("Enter");

  await expect
    .poll(() => filters(page))
    .toEqual([[1, { kind: "custom", join: "and", conditions: [{ op: "gt", value: 10 }] }]]);
  await expect.poll(() => shownItems(page)).toEqual(["Item", "Apricot", "fig", "grape"]);
  await expect(grid(page)).toBeFocused();

  await grid(page).press("Alt+ArrowDown");
  await dropdown(page, "Qty").getByRole("button", { name: 'Clear Filter From "Qty"' }).click();
  await expect.poll(() => filters(page)).toEqual([]);
  await expect.poll(() => shownItems(page)).toHaveLength(ROWS.length);

  // Escape closes the dropdown without a change and gives the grid its focus back.
  await grid(page).press("Alt+ArrowDown");
  await expect(dropdown(page, "Qty")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dropdown(page, "Qty")).toBeHidden();
  await expect(grid(page)).toBeFocused();
});

test("the dropdown is keyboard-usable: search, arrows, Space and Enter", async ({ page }) => {
  await open(page);
  await grid(page).press("ControlOrMeta+Shift+L");
  await grid(page).press("ArrowUp");
  await grid(page).press("ArrowLeft");
  await grid(page).press("Alt+ArrowDown");
  const dialog = dropdown(page, "Item");
  await expect(dialog).toBeVisible();

  const search = dialog.getByRole("searchbox", { name: "Search values of Item" });
  await search.focus();
  await page.keyboard.type("ap");
  await page.keyboard.press("ArrowDown");
  const list = dialog.getByRole("listbox", { name: "Values of Item" });
  await expect(list).toBeFocused();
  await expect(list.getByRole("option")).toHaveText([
    "(Select All Search Results)",
    "Add current selection to filter",
    // Each value counts its rows.
    "apple 1",
    "Apricot 1",
    "grape 1",
  ]);
  // Untick "apple", then apply: only the other search results stay.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press(" ");
  await page.keyboard.press("Enter");
  await expect.poll(() => shownItems(page)).toEqual(["Item", "Apricot", "grape"]);
});
