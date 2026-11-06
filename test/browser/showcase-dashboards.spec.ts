import { expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/dashboards/");

const controls = (page: Page) => page.getByRole("complementary", { name: "Controls" });
const item = (page: Page, id: string) => page.getByTestId(`dashboard-item-${id}`);
const filteredRevenue = (page: Page) => page.getByTestId("dashboard-filtered-revenue");

test("a slicer filters the dashboard and each change is one undo step", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(ROUTE);
  await expect(filteredRevenue(page)).toHaveText(/^\$[\d,]+$/, { timeout: 30_000 });
  const allRegions = await filteredRevenue(page).textContent();

  // The slicer narrows the pivot it filters; undo brings every region back.
  await controls(page).getByRole("button", { name: /in the Region slicer/ }).click();
  await expect(item(page, "region-slicer")).toContainText("Americas");
  await expect(filteredRevenue(page)).not.toHaveText(allRegions ?? "");
  await controls(page).getByRole("button", { name: "Undo" }).click();
  await expect(filteredRevenue(page)).toHaveText(allRegions ?? "");

  await controls(page).getByRole("button", { name: "Swap the chart and the pivot" }).click();
  await expect(item(page, "channel-pivot")).toHaveText(/^col 1, row 4/);
  await expect(item(page, "region-chart")).toHaveText(/^col 7, row 7/);

  await controls(page).getByRole("button", { name: "Add a product pivot" }).click();
  await expect(item(page, "product-pivot")).toBeVisible();
  await controls(page).getByRole("button", { name: "Undo" }).click();
  await expect(item(page, "product-pivot")).toHaveCount(0);
  expect(errors).toEqual([]);
});
