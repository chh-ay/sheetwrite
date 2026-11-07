import { expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/functions/");
const ERROR_VALUE = /^#[A-Z/0!?]+[!?]?$|^#N\/A$/;

const result = (page: Page, name: string) => page.getByTestId(`function-result-${name}`);

async function pickFamily(page: Page, family: string) {
  await page.getByRole("combobox", { name: "Family" }).click();
  await page.getByRole("option", { name: family, exact: true }).click();
}

test("every family calculates; only links to other workbooks show #REF!", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(ROUTE);
  await expect(result(page, "DEC2HEX")).toHaveText("7EA", { timeout: 30_000 });
  for (const family of [
    "Engineering",
    "Financial",
    "Statistics",
    "Information",
    "Math & text",
    "Lookup",
    "Regex",
  ]) {
    await pickFamily(page, family);
    const values = await page
      .getByRole("complementary", { name: "Controls" })
      .locator("[data-testid^=function-result-]")
      .allTextContents();
    expect(values.length, family).toBeGreaterThan(0);
    for (const value of values) expect(value, family).not.toMatch(ERROR_VALUE);
  }

  await pickFamily(page, "Links");
  await expect(result(page, "Cell")).toHaveText("#REF!");
  expect(errors).toEqual([]);
});

test("changing an input recalculates the family", async ({ page }) => {
  await page.goto(ROUTE);
  await expect(result(page, "DEC2HEX")).toHaveText("7EA", { timeout: 30_000 });
  const controls = page.getByRole("complementary", { name: "Controls" });
  await controls.getByRole("textbox", { name: /Number/ }).fill("255");
  await page.getByRole("button", { name: "Set number" }).click();
  await expect(result(page, "DEC2HEX")).toHaveText("FF");
});
