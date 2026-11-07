import { expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/queries/");

const ordersCounted = (page: Page) => page.getByTestId("queries-formula-Orders counted");
const fetches = (page: Page) => page.getByTestId("queries-fetches");
const countOf = async (page: Page) =>
  Number((await ordersCounted(page).textContent())?.replace(/,/g, ""));

async function refreshAll(page: Page) {
  await page.getByRole("button", { name: "Refresh All" }).last().click();
  await expect(page.getByText("Tables match the sources")).toBeVisible();
}

test("a refresh brings new orders and a changed step into the tables", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(ROUTE);
  await expect(page.getByText("Tables match the sources")).toBeVisible({ timeout: 30_000 });
  const shipped = await countOf(page);
  expect(shipped).toBeGreaterThan(0);

  // New orders reach the workbook only through a refresh.
  await page.getByRole("button", { name: /new orders arrive/ }).click();
  expect(await countOf(page)).toBe(shipped);
  await refreshAll(page);
  const withNewOrders = await countOf(page);
  expect(withNewOrders).toBeGreaterThan(shipped);

  // A changed step is saved at once and applied by the next refresh.
  await page.getByRole("radio", { name: "All statuses" }).click();
  await expect(page.getByText("Query changed: Refresh All to apply it")).toBeVisible();
  await refreshAll(page);
  expect(await countOf(page)).toBeGreaterThan(withNewOrders);

  // Undo restores the recorded values without another source load.
  const loads = await fetches(page).textContent();
  await page
    .getByRole("complementary", { name: "Controls" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(ordersCounted(page)).toHaveText(withNewOrders.toLocaleString("en"));
  await expect(fetches(page)).toHaveText(loads ?? "");
  expect(errors).toEqual([]);
});

test("Queries & Connections lists the saved queries", async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByText("Tables match the sources")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Queries & Connections…" }).click();
  await expect(page.locator(".sheetwrite-panel").getByText("Region totals").first()).toBeVisible();
});
