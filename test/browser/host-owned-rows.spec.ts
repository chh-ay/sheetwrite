import { expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const route = siteUrl("/showcases/host-rows/");

test("host-owned rows keep stable identity across view and reconciliation changes", async ({
  page,
}) => {
  await page.goto(route);
  await expect(page.getByTestId("host-rows-showcase")).toBeVisible();
  const accounts = page.getByTestId("host-entity-list");
  const first = accounts.locator('[data-account-id="account-001"]');
  const second = accounts.locator('[data-account-id="account-002"]');
  await expect(accounts.locator("tbody tr")).toHaveCount(48);
  await expect(first).toContainText("Alder Quay Logistics");
  await expect(first).toContainText("$120,000");

  await page.getByRole("button", { name: "Sort amount" }).click();
  await page.getByRole("button", { name: "Filter North" }).click();
  await expect(first).toContainText("$120,000");
  await expect(second).toContainText("$75,000");
  await expect(accounts.locator("tbody tr")).toHaveCount(48);

  await page.getByRole("button", { name: "Insert row" }).click();
  await expect(accounts.locator("tbody tr")).toHaveCount(49);
  await expect(accounts.locator('[data-account-id="account-049"]')).toContainText("New account");
  await page.getByRole("button", { name: "Delete row" }).click();
  await expect(accounts.locator("tbody tr")).toHaveCount(48);
  await expect(accounts.locator('[data-account-id="account-049"]')).toHaveCount(0);

  // Denied writes cannot change the host-owned account, even after view changes.
  await page.getByRole("button", { name: "Reject next edit" }).click();
  await expect(page.getByTestId("host-delta-log")).toContainText("rejected");
  await expect(first).toContainText("$120,000");

  await page.getByRole("button", { name: "Transformed accept" }).click();
  await expect(page.getByTestId("host-delta-log")).toContainText("transformed");
  await expect(second).toContainText("$80,000");

  await page.getByRole("button", { name: "Remote update" }).click();
  await expect(page.getByTestId("host-delta-log")).toContainText("remote");
  await expect(first).toContainText("$135,000");
  await expect(second).toContainText("$80,000");

  await page.getByTestId("host-import-leads").click();
  await expect(page.getByTestId("host-record-count")).toContainText("10,048 records");
  // One bridge insert, then the 50,000 cell values in bounded commits: the Grid
  // caps one transaction at 10,000 operations (10,000 / 1,800 rows = 6 commits).
  await expect(page.getByTestId("host-import-timing")).toContainText("ms");
  await expect(page.getByTestId("host-import-timing")).toContainText("6 commits");
  await expect(accounts.locator('[data-account-id="account-050"]')).toContainText(
    "Alder Vale Logistics",
  );
  await expect(first).toContainText("$135,000");
  await expect(page.getByTestId("host-import-leads")).toBeDisabled();
});

const GRID = ".host-rows-showcase .sheetwrite";

/** Host buttons stay disabled until the Grid is ready for input. */
async function openShowcase(page: Page): Promise<void> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(route);
  await expect(page.getByRole("button", { name: "Insert row", exact: true })).toBeEnabled();
}

/** Selects the ARR cell (column B) of a data row, starting from A1. */
async function selectArrCell(page: Page, row: number): Promise<void> {
  await page.locator(GRID).focus();
  await page.keyboard.press("ControlOrMeta+Home");
  for (let step = 0; step < row; step++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
}

/** Reads an ARR cell through the Grid's own copy command. */
async function copiedArrCell(page: Page, row: number): Promise<string> {
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await selectArrCell(page, row);
  await page.keyboard.press("ControlOrMeta+c");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toBe("");
  return page.evaluate(() => navigator.clipboard.readText());
}

test("pasted and cleared ARR cells update the host account store", async ({ page }) => {
  await openShowcase(page);
  const first = page.getByTestId("host-entity-list").locator('[data-account-id="account-001"]');
  const total = page.getByTestId("host-arr-total").locator("strong");
  await expect(first).toContainText("$120,000");
  const totalBefore = Number((await total.innerText()).replace(/[$,]/g, ""));

  await selectArrCell(page, 0);
  await page.evaluate(() => navigator.clipboard.writeText("90000"));
  await page.keyboard.press("ControlOrMeta+v");
  await expect(first).toContainText("$90,000");
  await expect(total).toHaveText(`$${(totalBefore - 30_000).toLocaleString("en-US")}`);
  // The host render that follows must not rebuild the Grid from its first rows.
  expect(await copiedArrCell(page, 0)).toBe("90000");

  await selectArrCell(page, 0);
  await page.keyboard.press("Delete");
  await expect(first).toContainText("$0");
  await expect(total).toHaveText(`$${(totalBefore - 120_000).toLocaleString("en-US")}`);
});

test("a transformed acceptance shows the stored value in the Grid", async ({ page }) => {
  await openShowcase(page);
  const log = page.getByTestId("host-delta-log");
  const second = page.getByTestId("host-entity-list").locator('[data-account-id="account-002"]');

  await page.getByRole("button", { name: "Transformed accept" }).click();

  await expect(second).toContainText("$80,000");
  expect(await copiedArrCell(page, 1)).toBe("80000");
  // The host hears of the server result once, as the transformed acceptance.
  await expect(log.locator("li")).toHaveCount(1);
  await expect(log.locator('li[data-status="transformed"]')).toHaveCount(1);
});
