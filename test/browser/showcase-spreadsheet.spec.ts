import { expect, test, type Page } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/spreadsheet/");

async function open(page: Page) {
  await page.goto(ROUTE);
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
}

async function select(page: Page, reference: string) {
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill(reference);
  await nameBox.press("Enter");
}

function cell(page: Page, sheet: string, row: number, col: number) {
  return page.evaluate(
    ([sheetId, r, c]) => {
      const grid = window.__sheetwriteSpreadsheetGrid;
      const stored = grid?.store.getCell({ sheet: sheetId, row: r, col: c });
      return { resolved: stored?.resolved ?? null, bold: stored?.style.bold === true };
    },
    [sheet, row, col] as const,
  );
}

test("ribbon commands edit the workbook and AutoSum totals the ledger", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  const ribbon = page.getByRole("region", { name: "Ribbon" });

  await select(page, "B2");
  const bold = ribbon.getByRole("button", { name: "Bold", exact: true });
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  expect((await cell(page, "sales", 1, 1)).bold).toBe(true);

  await select(page, "G50");
  await ribbon.getByRole("button", { name: "AutoSum" }).click();
  await expect(page.getByRole("textbox", { name: "Formula bar" })).toHaveValue("=SUM(G2:G49)");
  const total = await cell(page, "summary", 5, 2);
  expect((await cell(page, "sales", 49, 6)).resolved).toBeCloseTo(Number(total.resolved), 6);
  expect(errors).toEqual([]);
});

test("narrowing the window folds ribbon groups, and widening restores them", async ({ page }) => {
  await open(page);
  const editing = page.locator('.sheetwrite-ribbon-group[aria-label="Editing"]');
  await expect(editing).toHaveAttribute("data-size", "large");

  await page.getByRole("button", { name: "Narrow" }).click();
  await expect(editing).toHaveAttribute("data-size", "collapsed");
  await editing.getByRole("button", { name: /Editing/ }).click();
  await expect(page.locator('.sheetwrite-ribbon-popup[role="group"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "AutoSum" })).toBeVisible();

  await page.getByRole("button", { name: "Wide" }).click();
  await expect(editing).toHaveAttribute("data-size", "large");
});

test("the ribbon follows the site theme and the page fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const panel = page.locator(".sheetwrite-ribbon-panel:not([hidden])");
  const backgrounds: string[] = [];
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await expect
      .poll(async () => panel.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(backgrounds.at(-1) ?? "");
    backgrounds.push(await panel.evaluate((element) => getComputedStyle(element).backgroundColor));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  expect(backgrounds[0]).not.toBe(backgrounds[1]);
});
