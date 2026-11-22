import { expect, test } from "./fixtures.js";

test("a slicer filters the dashboard and each change is one undo step", async ({ page }) => {
  await page.goto("/showcases/dashboards/");
  const controls = page.getByRole("complementary", { name: "Controls" });
  const item = (id: string) => page.getByTestId(`dashboard-item-${id}`);
  // The Revenue KPI card's value, as the dashboard draws it.
  const revenue_card = page
    .getByTestId("dashboard-grid")
    .locator(".sheetwrite-dashboard-kpi")
    .filter({ hasText: /^\$/ })
    .first();
  await expect(revenue_card).toHaveText(/^\$[\d,]+$/, { timeout: 30_000 });
  const all_regions = (await revenue_card.textContent()) ?? "";

  // The slicer narrows the KPI card it filters; undo brings every region back.
  await controls.getByRole("button", { name: /in the Region slicer/ }).click();
  await expect(page.getByTestId("dashboard-region-selection")).toHaveText("Americas");
  await expect(revenue_card).not.toHaveText(all_regions);
  await controls.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("dashboard-region-selection")).toHaveText("Every region");
  await expect(revenue_card).toHaveText(all_regions);

  await controls.getByRole("button", { name: "Swap the chart and the pivot" }).click();
  await expect(item("channel-pivot")).toHaveText(/^col 1, row 4/);
  await expect(item("region-chart")).toHaveText(/^col 7, row 4/);
  await controls.getByRole("button", { name: "Add a product pivot" }).click();
  await expect(item("product-pivot")).toBeVisible();
  await controls.getByRole("button", { name: "Undo" }).click();
  await expect(item("product-pivot")).toHaveCount(0);
});
