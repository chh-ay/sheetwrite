import { expect, test } from "./fixtures.js";

test("a refresh brings new orders and a changed step into the tables", async ({ page }) => {
  await page.goto("/showcases/queries/");
  const matched = page.getByText("Tables match the sources");
  const ordersCounted = page.getByTestId("queries-formula-Orders counted");
  const fetches = page.getByTestId("queries-fetches");
  const count = async () => Number((await ordersCounted.textContent())?.replace(/,/g, ""));
  const refreshAll = async () => {
    await page.getByRole("button", { name: "Refresh All" }).last().click();
    await expect(matched).toBeVisible();
  };
  await expect(matched).toBeVisible({ timeout: 30_000 });
  const shipped = await count();
  expect(shipped).toBeGreaterThan(0);

  // New orders reach the workbook only through a refresh.
  await page.getByRole("button", { name: /new orders arrive/ }).click();
  expect(await count()).toBe(shipped);
  await refreshAll();
  const withNewOrders = await count();
  expect(withNewOrders).toBeGreaterThan(shipped);

  // A changed step is saved at once and applied by the next refresh.
  await page.getByRole("radio", { name: "All statuses" }).click();
  await expect(page.getByText("Query changed: Refresh All to apply it")).toBeVisible();
  await refreshAll();
  expect(await count()).toBeGreaterThan(withNewOrders);

  // Undo restores the recorded values without another source load.
  const loads = (await fetches.textContent()) ?? "";
  await page
    .getByRole("complementary", { name: "Controls" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(ordersCounted).toHaveText(withNewOrders.toLocaleString("en"));
  await expect(fetches).toHaveText(loads);
});
