import { expect, test } from "@playwright/test";
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
