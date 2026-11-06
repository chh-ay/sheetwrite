import { expect, test, type Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { siteUrl } from "./playwright.config.js";

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

const ROUTE = siteUrl("/showcases/spreadsheet/");
const SHOTS = process.env.SHEETWRITE_SCREENSHOT_DIR;

/** Give the showcase workbook one link and a formula on its first sheet that reads it. */
async function link(page: Page): Promise<string> {
  return page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid;
    if (grid === undefined) throw new Error("no showcase grid");
    const sheet = grid.store.getWorkbook().sheets[0]?.id ?? "";
    grid.applyTransaction({
      patches: [
        {
          op: "setExternalLinks",
          links: [
            {
              book: "Budget 2024.xlsx",
              target: "https://files.example/finance/Budget 2024.xlsx",
              sheets: [{ name: "Annual", cells: [{ row: 9, col: 2, value: 1250 }] }],
            },
          ],
        },
        {
          op: "set",
          addr: { sheet, row: 0, col: 0 },
          value: { kind: "formula", src: "='[Budget 2024.xlsx]Annual'!C10" },
        },
      ],
    });
    return sheet;
  });
}

function a1(page: Page, sheet: string) {
  return page.evaluate((id) => {
    const grid = window.__sheetwriteSpreadsheetGrid;
    const addr = { sheet: id, row: 0, col: 0 };
    return { value: grid?.store.getCell(addr).resolved, formula: grid?.store.getFormula(addr) };
  }, sheet);
}

test("Edit Links lists a link, changes its source and breaks it @edit-links", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.goto(ROUTE);
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  await ribbon.getByRole("tab", { name: "Data" }).click();
  await expect(ribbon.getByRole("button", { name: "Edit Links" })).toBeHidden();

  const sheet = await link(page);
  expect(await a1(page, sheet)).toEqual({
    value: 1250,
    formula: "='[Budget 2024.xlsx]Annual'!C10",
  });
  await ribbon.getByRole("button", { name: "Edit Links" }).click();
  const panel = page.locator(".sheetwrite-panel");
  await expect(panel.getByRole("heading", { name: "Budget 2024.xlsx" })).toBeVisible();
  await expect(panel).toContainText("Status: Saved values");
  await expect(panel.getByRole("button", { name: "Update All" })).toBeDisabled();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/edit-links-list.png` });

  await panel.getByRole("button", { name: "Change Source" }).click();
  await panel.getByLabel("File name").fill("Budget 2025.xlsx");
  await panel.getByLabel("Location").fill("https://files.example/finance/Budget 2025.xlsx");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/edit-links-source.png` });
  await panel.getByRole("button", { name: "Change Source" }).click();
  expect(await a1(page, sheet)).toEqual({
    value: 1250,
    formula: "='[Budget 2025.xlsx]Annual'!C10",
  });

  await panel.getByRole("button", { name: "Break Link" }).click();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/edit-links-break.png` });
  await panel.getByRole("button", { name: "Break Link" }).click();
  expect(await a1(page, sheet)).toEqual({ value: 1250, formula: null });
  await expect(panel).toContainText("This workbook has no links to other workbooks.");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/edit-links-broken.png` });
  expect(errors).toEqual([]);
});
