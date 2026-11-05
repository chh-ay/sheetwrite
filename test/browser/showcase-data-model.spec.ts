import { expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/data-model/");

const products = (page: Page) => page.getByTestId("model-relationship-orders-products");
const revenue = (page: Page) => page.getByTestId("model-read-Revenue");
const undo = (page: Page) =>
  page.getByRole("complementary", { name: "Controls" }).getByRole("button", { name: "Undo" });

async function open(page: Page) {
  await page.goto(ROUTE);
  await expect(products(page).getByText("Keys match")).toBeVisible({ timeout: 30_000 });
}

test("the model pivot regroups by related fields and reports broken keys", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  const total = await revenue(page).textContent();
  expect(total).toMatch(/^\$[\d,]+$/);

  // Grouping by a column of another related table keeps the grand total.
  await page.getByRole("radio", { name: "Manager" }).click();
  await expect(page.getByRole("radio", { name: "Manager" })).toBeChecked();
  await expect(revenue(page)).toHaveText(total ?? "");

  // A repeated lookup key is reported, and the pivot cannot read the totals.
  await page.getByRole("radio", { name: "Category" }).click();
  await page.getByRole("button", { name: "Repeat a product ID" }).click();
  await expect(products(page).getByText("A lookup key repeats")).toBeVisible();
  await expect(revenue(page)).not.toHaveText(total ?? "");
  await undo(page).click();
  await expect(products(page).getByText("Keys match")).toBeVisible();
  await expect(revenue(page)).toHaveText(total ?? "");

  // An order whose product is in no row of Products is counted as unmatched.
  await page.getByRole("button", { name: /Order product/ }).click();
  await expect(products(page).getByText("1 order without a match")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the field list shows the columns of the related tables", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "PivotTable Fields…" }).click();
  await expect(
    page
      .locator(".sheetwrite-panel")
      .getByText(/Products/)
      .first(),
  ).toBeVisible();
});
