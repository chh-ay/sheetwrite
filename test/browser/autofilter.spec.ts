import type { Page } from "@playwright/test";

import { expect, nextFrames, test } from "./fixtures.js";

// Excel's AutoFilter, driven through the header buttons, the dropdown and the
// keyboard, and the validation list and checkbox editors, on the Vue
// workbench's grid in one boot.

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

/** The Item column's text of every shown row, from the store's view. */
function shown_items(page: Page): Promise<unknown[]> {
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

test("AutoFilter (values, Number Filters, search, Clear) and validation editors from the header buttons and the keyboard", async ({
  page,
}) => {
  await open(page);
  const grid = page.locator(".sw-demo-grid .sheetwrite");
  const buttons = page.locator(".sw-demo-grid .sheetwrite-autofilter-button");
  // The glyphs drawn over the buttons, from the icon sheet.
  const glyphs = page.locator(".sw-demo-grid .sheetwrite-autofilter-glyph.sheetwrite-icon");
  const item_dialog = page.getByRole("dialog", { name: "Filter Item" });
  const qty_dialog = page.getByRole("dialog", { name: "Filter Qty" });
  const item_values = item_dialog.getByRole("listbox", { name: "Values of Item" });
  const filters = () =>
    page.evaluate(() => [...(window.__sheetwriteVueWorkbench?.grid.getColumnFilters() ?? [])]);

  // Ctrl+Shift+L shows the buttons; a value filter from a real pointer hit on
  // the button over the canvas hides the unticked rows, and the header stays.
  await grid.press("ControlOrMeta+Shift+L");
  await expect(buttons).toHaveCount(2);
  await expect(buttons.first()).toHaveAttribute("data-filtered", "false");
  await expect(glyphs.first()).toHaveAttribute("data-icon", "filterArrow");
  await nextFrames(page);
  const box = await buttons.first().boundingBox();
  if (!box) throw new Error("no filter button for the Item column");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(item_dialog).toBeVisible();
  await item_values.getByRole("option", { name: "banana" }).click();
  await item_values.getByRole("option", { name: "fig" }).click();
  await item_dialog.getByRole("button", { name: "OK" }).click();
  await expect(item_dialog).toBeHidden();
  await expect.poll(() => shown_items(page)).toEqual(["Item", "apple", "Apricot", "grape"]);
  await expect(buttons.first()).toHaveAttribute("data-filtered", "true");
  await expect(glyphs.first()).toHaveAttribute("data-icon", "filterActive");
  // The header cell keeps the selection, as in Excel.
  await expect
    .poll(() => page.evaluate(() => window.__sheetwriteVueWorkbench?.grid.getSelection()))
    .toEqual({ kind: "cell", addr: { sheet: SHEET, row: 0, col: 0 } });
  // Undo brings the rows back; redo hides them again.
  await grid.press("ControlOrMeta+z");
  await expect.poll(() => shown_items(page)).toHaveLength(ROWS.length);
  await grid.press("ControlOrMeta+Shift+z");
  await expect.poll(() => shown_items(page)).toHaveLength(4);
  // Ctrl+Shift+L again turns the AutoFilter off and removes its buttons.
  await grid.press("ControlOrMeta+Shift+L");
  await expect(buttons).toHaveCount(0);
  await expect(glyphs).toHaveCount(0);

  // B1 is the Qty header: Alt+Down opens its dropdown. A Number Filters
  // condition, then Clear Filter From, each give the grid its focus back.
  await grid.press("ArrowRight");
  await grid.press("ControlOrMeta+Shift+L");
  await grid.press("Alt+ArrowDown");
  await expect(qty_dialog).toBeVisible();
  await qty_dialog.getByRole("button", { name: "Number Filters" }).click();
  await qty_dialog.getByRole("menuitem", { name: "Greater Than…" }).click();
  const form = qty_dialog.getByRole("form", { name: "Custom AutoFilter for Qty" });
  await form.getByRole("textbox", { name: "Value 1" }).fill("10");
  await form.getByRole("textbox", { name: "Value 1" }).press("Enter");
  await expect
    .poll(filters)
    .toEqual([[1, { kind: "custom", join: "and", conditions: [{ op: "gt", value: 10 }] }]]);
  await expect.poll(() => shown_items(page)).toEqual(["Item", "Apricot", "fig", "grape"]);
  await expect(grid).toBeFocused();
  await grid.press("Alt+ArrowDown");
  await qty_dialog.getByRole("button", { name: 'Clear Filter From "Qty"' }).click();
  await expect.poll(filters).toEqual([]);
  await expect.poll(() => shown_items(page)).toHaveLength(ROWS.length);
  // Escape closes the dropdown without a change and gives the grid its focus back.
  await grid.press("Alt+ArrowDown");
  await expect(qty_dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(qty_dialog).toBeHidden();
  await expect(grid).toBeFocused();

  // The dropdown is keyboard-usable: search, arrows, Space and Enter.
  await grid.press("ArrowLeft");
  await grid.press("Alt+ArrowDown");
  await expect(item_dialog).toBeVisible();
  await item_dialog.getByRole("searchbox", { name: "Search values of Item" }).focus();
  await page.keyboard.type("ap");
  await page.keyboard.press("ArrowDown");
  await expect(item_values).toBeFocused();
  await expect(item_values.getByRole("option")).toHaveText([
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
  await expect.poll(() => shown_items(page)).toEqual(["Item", "Apricot", "grape"]);

  // Validation editors on the orders sheet. The rules are host configuration
  // (public API); each editor opens through user input on the grid host.
  const order_cell = (row: number) =>
    page.evaluate(
      (at) =>
        window.__sheetwriteVueWorkbench?.grid.store.getCell({ sheet: "orders", row: at, col: 0 })
          .resolved,
      row,
    );
  await page.evaluate(() => {
    const vue_grid = window.__sheetwriteVueWorkbench?.grid;
    if (!vue_grid) throw new Error("Vue grid is unavailable");
    vue_grid.setActiveSheet("orders");
    vue_grid.setValidationRule({
      id: "browser-list",
      range: { sheet: "orders", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      condition: { kind: "list", values: [1, 2, 3] },
      policy: "reject",
      helpText: "Choose an order ID",
    });
    vue_grid.setValidationRule({
      id: "browser-checkbox",
      range: { sheet: "orders", start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
      condition: { kind: "checkbox", checkedValue: true, uncheckedValue: false },
      policy: "reject",
    });
    vue_grid.setSelection({ kind: "cell", addr: { sheet: "orders", row: 0, col: 0 } });
  });
  // Alt+Down opens a list rule's list, as in Excel (F2 edits a list cell's
  // text). Typing filters the open list; Enter stores the item the text names
  // and closes it.
  await grid.press("Alt+ArrowDown");
  const choices = page.getByRole("listbox", { name: "Choices" });
  await expect(choices).toBeVisible();
  await page.keyboard.type("2");
  await page.keyboard.press("Enter");
  await expect(choices).toBeHidden();
  await expect.poll(() => order_cell(0)).toBe(2);
  // F2 on a checkbox cell opens its checkbox, which Space toggles.
  await page.evaluate(() =>
    window.__sheetwriteVueWorkbench?.grid.setSelection({
      kind: "cell",
      addr: { sheet: "orders", row: 1, col: 0 },
    }),
  );
  await grid.press("F2");
  await expect(page.getByRole("checkbox", { name: "Toggle checkbox" })).toBeVisible();
  await page.keyboard.press(" ");
  await expect.poll(() => order_cell(1)).toBe(true);
});
