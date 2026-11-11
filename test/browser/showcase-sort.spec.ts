import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.js";

/** A control group of the side panel, found by its title. */
const group = (page: Page, title: string) =>
  page.locator("section", { has: page.getByRole("heading", { name: title, exact: true }) });

test("an in-place sort moves the cells and a view sort does not", async ({ page }) => {
  await page.goto("/showcases/sort/");
  const cells = group(page, "Sort the cells");
  const view = group(page, "Sort the view only");
  const firstOrder = page.getByTestId("sort-watch-Order in row 1");
  await expect(cells.getByRole("button", { name: "Revenue, largest first" })).toBeEnabled({
    timeout: 30_000,
  });
  const startOrder = (await firstOrder.textContent()) ?? "";
  const largest = (await page.getByTestId("sort-watch-Largest order").textContent()) ?? "";
  expect(startOrder).not.toBe(largest);

  // The view sort shows the largest order first, but row 1 still holds the first order.
  await view.getByRole("button", { name: "Revenue, largest first" }).click();
  await expect(page.getByText("Cells in their original rows")).toBeVisible();
  await expect(firstOrder).toHaveText(startOrder);
  await view.getByRole("button", { name: "Clear view sort" }).click();

  // The in-place sort moves the largest order into row 1, and the Watch formula follows it.
  await cells.getByRole("button", { name: "Revenue, largest first" }).click();
  await expect(firstOrder).toHaveText(largest);
  await expect(page.getByText(/orders on new rows/)).toBeVisible();

  // One undo step puts every order back.
  await group(page, "What the formulas read").getByRole("button", { name: "Undo" }).click();
  await expect(firstOrder).toHaveText(startOrder);
});
