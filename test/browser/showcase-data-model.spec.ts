import { expect, test } from "./fixtures.js";

test("the model pivot regroups by related fields and reports broken keys", async ({ page }) => {
  await page.goto("/showcases/data-model/");
  const products = page.getByTestId("model-relationship-orders-products");
  const revenue = page.getByTestId("model-read-Revenue");
  await expect(products.getByText("Keys match")).toBeVisible({ timeout: 30_000 });
  const total = (await revenue.textContent()) ?? "";
  expect(total).toMatch(/^\$[\d,]+$/);

  // Grouping by a column of another related table keeps the grand total.
  await page.getByRole("radio", { name: "Manager" }).click();
  await expect(page.getByRole("radio", { name: "Manager" })).toBeChecked();
  await expect(revenue).toHaveText(total);

  // A repeated lookup key is reported, and the pivot cannot read the totals.
  await page.getByRole("radio", { name: "Category" }).click();
  await page.getByRole("button", { name: "Repeat a product ID" }).click();
  await expect(products.getByText("A lookup key repeats")).toBeVisible();
  await expect(revenue).not.toHaveText(total);
  await page
    .getByRole("complementary", { name: "Controls" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(products.getByText("Keys match")).toBeVisible();
  await expect(revenue).toHaveText(total);

  // An order whose product is in no row of Products is counted as unmatched.
  await page.getByRole("button", { name: /Order product/ }).click();
  await expect(products.getByText("1 order without a match")).toBeVisible();
});
