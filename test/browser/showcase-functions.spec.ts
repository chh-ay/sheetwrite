import { expect, test } from "./fixtures.js";

const ERROR_VALUE = /^#[A-Z/0!?]+[!?]?$|^#N\/A$/;

test("every family calculates; only links to other workbooks show #REF!", async ({ page }) => {
  await page.goto("/showcases/functions/");
  const controls = page.getByRole("complementary", { name: "Controls" });
  const result = (name: string) => page.getByTestId(`function-result-${name}`);
  const pickFamily = async (family: string) => {
    await page.getByRole("combobox", { name: "Family" }).click();
    await page.getByRole("option", { name: family, exact: true }).click();
  };
  await expect(result("DEC2HEX")).toHaveText("7EA", { timeout: 30_000 });
  // Changing an input recalculates the family.
  await controls.getByRole("textbox", { name: /Number/ }).fill("255");
  await page.getByRole("button", { name: "Set number" }).click();
  await expect(result("DEC2HEX")).toHaveText("FF");

  for (const family of [
    "Engineering",
    "Financial",
    "Statistics",
    "Information",
    "Math & text",
    "Lookup",
    "Regex",
  ]) {
    await pickFamily(family);
    const values = await controls.locator("[data-testid^=function-result-]").allTextContents();
    expect(values.length, family).toBeGreaterThan(0);
    for (const value of values) expect(value, family).not.toMatch(ERROR_VALUE);
  }
  await pickFamily("Links");
  await expect(result("Cell")).toHaveText("#REF!");
});
