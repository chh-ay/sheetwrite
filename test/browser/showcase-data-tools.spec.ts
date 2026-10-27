import { expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/data-tools/");

const SORT = "Sort by region, then units";

/** Region is a custom select: open its trigger, then pick the option. */
async function pickRegion(page: Page, region: string) {
  await page.locator(".sw-data-region .sw-demo-select__trigger").click();
  await page.getByRole("option", { name: region }).click();
}

test("dispatch controls compose a view and report real policy outcomes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(ROUTE);
  await expect(page.getByRole("button", { name: SORT })).toBeEnabled();
  await expect(page.getByTestId("data-visible")).toHaveText("4,800 / 4,800 rows visible");
  await pickRegion(page, "EMEA");
  await page.getByLabel("Customer").fill("Northstar");
  await expect(page.getByTestId("data-visible")).toHaveText("640 / 4,800 rows visible");
  await page.getByRole("button", { name: SORT }).click();
  await expect(page.getByTestId("data-events")).toContainText(
    "Sorted by region, then by units, largest first.",
  );
  await page.getByRole("button", { name: "Clear view", exact: true }).click();
  await expect(page.getByTestId("data-visible")).toHaveText("4,800 / 4,800 rows visible");
  await expect(page.locator(".sw-data-region .sw-demo-select__trigger")).toHaveText("All regions");
  await page.getByRole("button", { name: "Collapse batch" }).click();
  await expect(page.getByTestId("data-visible")).toHaveText("4,776 / 4,800 rows visible");
  await page.getByRole("button", { name: "Hide rows 25–27" }).click();
  await expect(page.getByTestId("data-visible")).toHaveText("4,773 / 4,800 rows visible");
  await page.getByRole("button", { name: "Hide freight & owner" }).click();
  await expect(page.getByText("Hidden: 3 rows, 2 columns")).toBeVisible();
  await page.getByRole("button", { name: "Expand batch" }).click();
  await page.getByRole("button", { name: "Unhide rows", exact: true }).click();
  await page.getByRole("button", { name: "Unhide columns", exact: true }).click();
  await expect(page.getByTestId("data-visible")).toHaveText("4,800 / 4,800 rows visible");
  await page.getByRole("button", { name: "Try units −5" }).click();
  await expect(page.getByTestId("data-probe-units")).toHaveText("Rejected. Still 1.");
  await expect(page.getByTestId("data-events")).toContainText("Units −5 rejected.");
  await page.getByRole("button", { name: "Try freight $350" }).click();
  await expect(page.getByTestId("data-probe-freight")).toHaveText("Saved with a warning: 350.");
  await expect(page.getByTestId("data-events")).toContainText("Freight $350 saved with a warning.");
  await page.getByRole("button", { name: "Try a new order ID" }).click();
  await expect(page.getByTestId("data-probe-order")).toHaveText("Rejected. Still ORD-10001.");
  await page.getByRole("button", { name: "Manager", exact: true }).click();
  await expect(page.getByRole("button", { name: "Manager", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Try a new order ID" }).click();
  await expect(page.getByTestId("data-probe-order")).toHaveText("Saved: MANAGER-REVIEW.");
  expect(errors).toEqual([]);
});

test("data tools fits a narrow viewport in either theme", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE);
  await expect(page.getByRole("button", { name: "Clear view", exact: true })).toBeEnabled();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.getByTestId("data-grid").locator("canvas").first()).toBeVisible();
  }
});
