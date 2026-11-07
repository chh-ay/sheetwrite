import { expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/recalculation/");
const MEASURED = /^\d+(\.\d)? ms$/;

const controls = (page: Page) => page.getByRole("complementary", { name: "Controls" });

test("each edit is recalculated, timed and painted", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(ROUTE);
  const change = controls(page).getByRole("button", { name: "Change the price" });
  await expect(change).toBeEnabled({ timeout: 60_000 });
  const revenue = controls(page)
    .getByText(/^\$[\d,]+$/)
    .first();
  const before = await revenue.textContent();

  await change.click();
  await expect(page.getByTestId("recalc-fan-out")).toHaveText(MEASURED);
  await expect(revenue).not.toHaveText(before ?? "");
  await expect(controls(page).getByText("3 · Frame painted")).toBeVisible();

  await controls(page).getByRole("button", { name: "Move the lookups" }).click();
  await expect(page.getByTestId("recalc-lookups")).toHaveText(MEASURED);
  await expect(page.getByTestId("recalc-runs").locator("li")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("the merged engine showcase address opens this page", async ({ page }) => {
  await page.goto(siteUrl("/showcases/engine/"));
  await expect(page).toHaveURL(ROUTE);
});
