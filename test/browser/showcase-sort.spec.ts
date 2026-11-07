import { expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/sort/");

/** A control group of the side panel, found by its title. */
const group = (page: Page, title: string) =>
  page.locator("section", { has: page.getByRole("heading", { name: title, exact: true }) });

const firstOrder = (page: Page) => page.getByTestId("sort-watch-Order in row 1");
const largestOrder = (page: Page) => page.getByTestId("sort-watch-Largest order");

test("an in-place sort moves the cells and a view sort does not", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(ROUTE);
  const cells = group(page, "Sort the cells");
  const view = group(page, "Sort the view only");
  await expect(cells.getByRole("button", { name: "Revenue, largest first" })).toBeEnabled({
    timeout: 30_000,
  });
  const startOrder = await firstOrder(page).textContent();
  const largest = await largestOrder(page).textContent();
  expect(startOrder).not.toBe(largest);

  // The view sort shows the largest order first, but row 1 still holds the first order.
  await view.getByRole("button", { name: "Revenue, largest first" }).click();
  await expect(page.getByText("Cells in their original rows")).toBeVisible();
  await expect(firstOrder(page)).toHaveText(startOrder ?? "");
  await view.getByRole("button", { name: "Clear view sort" }).click();

  // The in-place sort moves the largest order into row 1, and the Watch formula follows it.
  await cells.getByRole("button", { name: "Revenue, largest first" }).click();
  await expect(firstOrder(page)).toHaveText(largest ?? "");
  await expect(page.getByText(/orders on new rows/)).toBeVisible();

  // One undo step puts every order back.
  await group(page, "What the formulas read").getByRole("button", { name: "Undo" }).click();
  await expect(firstOrder(page)).toHaveText(startOrder ?? "");
  expect(errors).toEqual([]);
});

test("Custom Sort opens the Sort panel over the orders", async ({ page }) => {
  await page.goto(ROUTE);
  const open = group(page, "Sort the cells").getByRole("button", { name: "Custom Sort…" });
  await expect(open).toBeEnabled({ timeout: 30_000 });
  await open.click();
  await expect(page.getByText("Sort view only (cells keep their rows)")).toBeVisible();
});
