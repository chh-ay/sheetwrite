import { expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/dashboards/");

const controls = (page: Page) => page.getByRole("complementary", { name: "Controls" });
const item = (page: Page, id: string) => page.getByTestId(`dashboard-item-${id}`);

test("dashboard items change as one undo step each", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(ROUTE);
  await expect(item(page, "region-pivot")).toHaveText(/^col 1, row 1/, { timeout: 30_000 });
  // The pivots compute on the dashboard, from the Orders table.
  await expect(page.getByTestId("dashboard-grid").getByText("Revenue by region")).toBeVisible();

  await controls(page).getByRole("button", { name: "Swap the two pivots" }).click();
  await expect(item(page, "region-pivot")).toHaveText(/^col 7, row 1/);
  await expect(item(page, "channel-pivot")).toHaveText(/^col 1, row 1/);

  await controls(page).getByRole("button", { name: "Add a product pivot" }).click();
  await expect(item(page, "product-pivot")).toBeVisible();
  await controls(page).getByRole("button", { name: "Keep one region in the slicer" }).click();
  await expect(item(page, "region-slicer")).toContainText("Americas");

  await controls(page).getByRole("button", { name: "Undo" }).click();
  await expect(item(page, "region-slicer")).not.toContainText("Americas");
  await controls(page).getByRole("button", { name: "Undo" }).click();
  await expect(item(page, "product-pivot")).toHaveCount(0);
  expect(errors).toEqual([]);
});
