import { expect, test } from "./fixtures.js";

test("a refresh brings new orders and a changed step into the tables", async ({ page }) => {
  await page.goto("/showcases/queries/");
  const matched = page.getByText("Tables match the sources");
  const orders_counted = page.getByTestId("queries-formula-Orders counted");
  const fetches = page.getByTestId("queries-fetches");
  const count = async () => Number((await orders_counted.textContent())?.replace(/,/g, ""));
  const refresh_all = async () => {
    await page.getByRole("button", { name: "Refresh All" }).last().click();
    await expect(matched).toBeVisible();
  };
  await expect(matched).toBeVisible({ timeout: 30_000 });
  const shipped = await count();
  expect(shipped).toBeGreaterThan(0);

  // New orders reach the workbook only through a refresh.
  await page.getByRole("button", { name: /new orders arrive/ }).click();
  await expect(page.getByText("New orders in the feed: Refresh All to load them")).toBeVisible();
  await expect(matched).toHaveCount(0);
  expect(await count()).toBe(shipped);
  await refresh_all();
  const with_new_orders = await count();
  expect(with_new_orders).toBeGreaterThan(shipped);

  // A changed step is saved at once and applied by the next refresh.
  await page.getByRole("radio", { name: "All statuses" }).click();
  await expect(page.getByText("Query changed: Refresh All to apply it")).toBeVisible();
  await refresh_all();
  expect(await count()).toBeGreaterThan(with_new_orders);

  // Undo restores the recorded values without another source load.
  const loads = (await fetches.textContent()) ?? "";
  await page
    .getByRole("complementary", { name: "Controls" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(orders_counted).toHaveText(with_new_orders.toLocaleString("en"));
  await expect(fetches).toHaveText(loads);
});
