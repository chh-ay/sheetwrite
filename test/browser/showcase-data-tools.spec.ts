import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.js";

/** Region is a semantic combobox: open it, then pick the option. */
async function pick_region(page: Page, region: string) {
  await page.getByRole("combobox", { name: "Region" }).click();
  await page.getByRole("option", { name: region }).click();
}

/** Assert the newest event-log line's tone and the API it names, not its wording. */
async function expect_latest_event(page: Page, tone: string, api: string) {
  const latest = page.getByTestId("data-events").locator("li").first();
  await expect(latest).toHaveAttribute("data-tone", tone);
  await expect(latest.locator("code")).toHaveText(api);
}

/** Assert the probe outcome and stored value without coupling to display wording. */
async function expect_probe(page: Page, key: string, outcome: string, stored: string) {
  const probe = page.getByTestId(`data-probe-${key}`);
  await expect(probe).toHaveAttribute("data-outcome", outcome);
  await expect(probe).toHaveAttribute("data-stored", stored);
}

test("dispatch controls compose a view and report real policy outcomes", async ({ page }) => {
  await page.goto("/showcases/data-tools/");
  await expect(page.getByRole("button", { name: "Clear view", exact: true })).toBeEnabled();
  await expect(page.getByTestId("data-visible")).toHaveText("4,800 / 4,800 rows visible");
  await pick_region(page, "EMEA");
  await page.getByLabel("Customer").fill("Northstar");
  await expect(page.getByTestId("data-visible")).toHaveText("640 / 4,800 rows visible");
  await expect_latest_event(page, "info", "setColumnFilter");
  await page.getByRole("button", { name: "Clear view", exact: true }).click();
  await expect(page.getByTestId("data-visible")).toHaveText("4,800 / 4,800 rows visible");
  await expect(page.getByRole("combobox", { name: "Region" })).toHaveText("All regions");
  // A rejected and a host-authorized write: this test owns each probe's outcome.
  await page.getByRole("button", { name: "Try units −5" }).click();
  await expect_probe(page, "units", "rejected", "1");
  await expect_latest_event(page, "reject", "applyTransaction");
  await page.getByRole("button", { name: "Manager", exact: true }).click();
  await expect(page.getByRole("button", { name: "Manager", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect_latest_event(page, "info", "Host role state");
  await page.getByRole("button", { name: "Try a new order ID" }).click();
  await expect_probe(page, "order", "saved", "MANAGER-REVIEW");
});
