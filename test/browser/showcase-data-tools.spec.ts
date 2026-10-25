import { expect, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/data-tools/");

test("dispatch controls compose a view and report real policy outcomes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(ROUTE);
  await expect(page.getByRole("button", { name: "Sort region → units ↓" })).toBeEnabled();
  await expect(page.getByTestId("data-visible")).toHaveText("4,800 / 4,800 rows visible");
  await page.getByLabel("Region · values").selectOption("EMEA");
  await page.getByLabel("Customer · contains").fill("Northstar");
  await expect(page.getByTestId("data-visible")).toHaveText("640 / 4,800 rows visible");
  await page.getByRole("button", { name: "Sort region → units ↓" }).click();
  await expect(page.getByTestId("data-events")).toContainText(
    "sortByMulti: Region ascending → Units descending",
  );
  await page.getByRole("button", { name: "Clear view", exact: true }).click();
  await expect(page.getByTestId("data-visible")).toHaveText("4,800 / 4,800 rows visible");
  await expect(page.getByLabel("Region · values")).toHaveValue("");
  await page.getByRole("button", { name: "Collapse batch" }).click();
  await expect(page.getByTestId("data-visible")).toHaveText("4,776 / 4,800 rows visible");
  await page.getByRole("button", { name: "Hide rows 25–27" }).click();
  await expect(page.getByTestId("data-visible")).toHaveText("4,773 / 4,800 rows visible");
  await page.getByRole("button", { name: "Hide freight & owner" }).click();
  await expect(page.getByText("Hidden: 3 rows · 2 columns")).toBeVisible();
  await page.getByRole("button", { name: "Expand batch" }).click();
  await page.getByRole("button", { name: "Unhide rows", exact: true }).click();
  await page.getByRole("button", { name: "Unhide columns", exact: true }).click();
  await expect(page.getByTestId("data-visible")).toHaveText("4,800 / 4,800 rows visible");
  await page.getByRole("button", { name: "Try units −5 · reject" }).click();
  await expect(page.getByTestId("data-probe")).toContainText("stored 1 (rejected)");
  await expect(page.getByTestId("data-events")).toContainText("mutation-rejected");
  await page.getByRole("button", { name: "Try freight $350 · warn" }).click();
  await expect(page.getByTestId("data-probe")).toContainText("stored 350 (applied)");
  await expect(page.getByTestId("data-events")).toContainText("validation warning");
  await page.getByRole("button", { name: "Try changing order ID" }).click();
  await expect(page.getByTestId("data-probe")).toContainText("stored ORD-10001 (rejected)");
  await page.getByRole("button", { name: "Role: operator" }).click();
  await page.getByRole("button", { name: "Try changing order ID" }).click();
  await expect(page.getByTestId("data-probe")).toContainText("stored MANAGER-REVIEW (applied)");
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
