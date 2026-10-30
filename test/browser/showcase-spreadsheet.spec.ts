import { expect, test, type Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { siteUrl } from "./playwright.config.js";

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

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
  await page.setViewportSize({ width: 1_600, height: 900 });
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

for (const mode of ["full", "compact"] as const) {
  test(`${mode} ribbon keeps tab, menu and toggle keyboard semantics @portability`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1_600, height: 900 });
    await open(page);
    const ribbon = page.getByRole("region", { name: "Ribbon" });
    const switcher = ribbon.getByRole("button", { name: "Compact ribbon" });
    await expect(ribbon).toHaveAttribute("data-mode", "full");
    if (mode === "compact") {
      await switcher.focus();
      await switcher.press("Space");
    }
    await expect(ribbon).toHaveAttribute("data-mode", mode);
    await expect(switcher).toHaveAttribute("aria-pressed", String(mode === "compact"));

    const home = ribbon.getByRole("tab", { name: "Home", exact: true });
    await home.focus();
    await home.press("ArrowRight");
    const insert = ribbon.getByRole("tab", { name: "Insert", exact: true });
    await expect(insert).toBeFocused();
    await expect(insert).toHaveAttribute("aria-selected", "true");
    await insert.press("Home");
    await expect(home).toBeFocused();

    await select(page, "B2");
    const bold = ribbon.getByRole("button", { name: "Bold", exact: true });
    const font = ribbon.getByRole("group", { name: "Font", exact: true });
    if (!(await bold.isVisible())) {
      await font.getByRole("button", { name: "Font", exact: true }).click();
    }

    await bold.focus();
    await bold.press("Space");
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    expect((await cell(page, "sales", 1, 1)).bold).toBe(true);

    const options = page.getByRole("button", { name: "Borders options" });
    await options.focus();
    await options.press("ArrowDown");
    const menu = page.getByRole("menu", { name: "Borders", exact: true });
    const bottom = menu.getByRole("menuitem", { name: "Bottom Border", exact: true });
    await expect(bottom).toBeFocused();
    await bottom.press("ArrowDown");
    const top = menu.getByRole("menuitem", { name: "Top Border", exact: true });
    await expect(top).toBeFocused();
    await top.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(options).toBeFocused();
    await expect(options).toHaveAttribute("aria-expanded", "false");
  });
}

test("automatic ribbon layout follows host width until the user chooses a mode", async ({
  page,
}) => {
  // Wide enough that the showcase host is above the default compact width.
  await page.setViewportSize({ width: 1_600, height: 900 });
  await open(page);
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  await expect(ribbon).toHaveAttribute("data-mode", "full");
  const panel = ribbon.getByRole("tabpanel");
  const fullHeight = await panel.evaluate((element) => element.getBoundingClientRect().height);

  await page.getByRole("button", { name: "Narrow" }).click();
  await expect(ribbon).toHaveAttribute("data-mode", "compact");
  expect(await panel.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(
    fullHeight,
  );
  const rows = await ribbon
    .locator('.sheetwrite-ribbon-group:not([data-size="collapsed"]) [data-command]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return Math.round(box.top + box.height / 2);
      }),
    );
  expect(rows.length).toBeGreaterThan(0);
  expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "Wide" }).click();
  await expect(ribbon).toHaveAttribute("data-mode", "full");
  await ribbon.getByRole("button", { name: "Compact ribbon" }).click();
  await expect(ribbon).toHaveAttribute("data-mode", "compact");
  await page.getByRole("button", { name: "Narrow" }).click();
  await page.getByRole("button", { name: "Wide" }).click();
  await expect(ribbon).toHaveAttribute("data-mode", "compact");
});
