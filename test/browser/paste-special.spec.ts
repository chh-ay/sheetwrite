import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { expect, test } from "./fixtures.js";

// Excel's Paste Special in a browser build: Ctrl+Alt+V, the dialog's letter
// keys, the Paste menu and the context menu's Paste Options row.
// https://support.microsoft.com/en-us/excel/paste-options

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1_600, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
}

/** Put 10 and 20 in A40:A41, 1 and 2 in C40:C41, and select A40:A41. */
async function numbers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    const sheet = grid.getActiveSheet();
    const set = (row: number, col: number, value: number) => ({
      op: "set" as const,
      addr: { sheet, row, col },
      value: { kind: "literal" as const, value },
    });
    grid.applyTransaction({
      patches: [set(39, 0, 10), set(40, 0, 20), set(39, 2, 1), set(40, 2, 2)],
    });
    grid.setSelection({
      kind: "range",
      range: { sheet, start: { row: 39, col: 0 }, end: { row: 40, col: 0 } },
    });
  });
  await page.locator(".sheetwrite").first().focus();
}

test("Ctrl+Alt+V opens Paste Special, whose letter keys choose @portability", async ({ page }) => {
  await open(page);
  await numbers(page);
  await page.keyboard.press("Control+Alt+KeyV");

  const dialog = page.getByRole("dialog", { name: "Paste Special" });
  await expect(dialog).toBeVisible();
  const all = dialog.getByRole("radio", { name: "All", exact: true });
  await expect(all).toBeFocused();
  await expect(all).toBeChecked();

  await page.keyboard.press("v");
  await expect(dialog.getByRole("radio", { name: "Values", exact: true })).toBeChecked();
  await page.keyboard.press("d");
  await expect(dialog.getByRole("radio", { name: "Add", exact: true })).toBeChecked();
  await page.keyboard.press("e");
  await expect(dialog.getByRole("checkbox", { name: "Transpose" })).toBeChecked();
  // Formats has no operation, as in Excel.
  await page.keyboard.press("t");
  await expect(dialog.getByRole("radio", { name: "Formats", exact: true })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "Add", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("radio", { name: "None", exact: true })).toBeChecked();
  await expect(dialog.getByRole("button", { name: "Paste Link" })).toBeDisabled();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".sheetwrite").first()).toBeFocused();
});

test("the context menu's Paste Options row and Paste Special @portability", async ({ page }) => {
  await open(page);
  await numbers(page);

  const cell = page.locator(".sheetwrite-scroller").first();
  const box = await cell.boundingBox();
  if (!box) throw new Error("Missing grid scroller");
  await page.mouse.click(box.x + 120, box.y + 120, { button: "right" });
  const menu = page.locator(".sheetwrite-context-menu").first();
  const options = menu.getByRole("group", { name: "Paste Options" });
  for (const name of ["Paste", "Values", "Formulas", "Transpose", "Formatting", "Paste Link"]) {
    await expect(options.getByRole("menuitem", { name, exact: true })).toBeVisible();
  }
  // Up and Down treat the row as one stop; Left and Right move inside it.
  await menu.getByRole("menuitem", { name: "Copy" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(options.getByRole("menuitem", { name: "Paste", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(options.getByRole("menuitem", { name: "Values", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const special = menu.getByRole("menuitem", { name: /^Paste Special…/ });
  await expect(special).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Paste Special" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("Paste Special adds copied values to the selected cells", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard permissions are Chromium's");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await numbers(page);
  await page.keyboard.press("Control+c");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15_000 })
    .toContain("10");
  await page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    grid.setSelection({ kind: "cell", addr: { sheet: grid.getActiveSheet(), row: 39, col: 2 } });
  });
  await page.keyboard.press("Control+Alt+KeyV");
  const dialog = page.getByRole("dialog", { name: "Paste Special" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("v");
  await page.keyboard.press("d");
  await expect(dialog.getByRole("radio", { name: "Add", exact: true })).toBeChecked();
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toHaveCount(0);
  const values = () =>
    page.evaluate(() => {
      const grid = window.__sheetwriteSpreadsheetGrid!;
      const sheet = grid.getActiveSheet();
      return [39, 40].map((row) => grid.store.getCell({ sheet, row, col: 2 }).resolved);
    });
  await expect.poll(values, { timeout: 15_000 }).toEqual([11, 22]);
});
