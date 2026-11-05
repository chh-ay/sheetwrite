import { expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/version-history/");

const controls = (page: Page) => page.getByRole("complementary", { name: "Controls" });
const changes = (page: Page) => page.getByTestId("history-changes").locator("li");

async function open(page: Page) {
  await page.goto(ROUTE);
  await expect(controls(page).getByText("Budget approved", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

test("a compare lists each author's changes and a restore brings the version back", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);

  await controls(page).getByRole("button", { name: "Raise Marketing by 15%" }).click();
  await expect(page.getByTestId("history-server-version")).toHaveText("1");
  await controls(page)
    .getByRole("button", { name: /cuts Travel/ })
    .click();
  await expect(page.getByTestId("history-server-version")).toHaveText("3");

  await controls(page).getByRole("button", { name: "Compare with now" }).click();
  await expect(changes(page)).toHaveCount(3);
  await expect(changes(page).filter({ hasText: "You" })).toHaveCount(1);
  await expect(changes(page).filter({ hasText: "Sam Lee" })).toHaveCount(2);

  // Restoring Q3 and Q4 undoes Sam's cuts and keeps your Q2 change.
  await controls(page).getByRole("button", { name: "Restore Q3 and Q4" }).click();
  await controls(page).getByRole("button", { name: "Compare with now" }).click();
  await expect(changes(page)).toHaveCount(1);
  await expect(changes(page).first()).toContainText("You");
  expect(errors).toEqual([]);
});

test("Save version adds a named version", async ({ page }) => {
  await open(page);
  await controls(page).getByRole("button", { name: "Save version" }).click();
  await expect(controls(page).getByText("Revision 1")).toBeVisible();
});
