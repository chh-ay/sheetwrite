import { expect, siteUrl, test } from "./fixtures.js";

const MEASURED = /^\d+(\.\d)? ms$/;

test("each edit is recalculated, timed and painted", async ({ page }) => {
  await page.goto("/showcases/recalculation/");
  const controls = page.getByRole("complementary", { name: "Controls" });
  const change = controls.getByRole("button", { name: "Change the price" });
  await expect(change).toBeEnabled({ timeout: 60_000 });
  const revenue = controls.getByText(/^\$[\d,]+$/).first();
  const before = (await revenue.textContent()) ?? "";

  await change.click();
  await expect(page.getByTestId("recalc-fan-out")).toHaveText(MEASURED);
  await expect(revenue).not.toHaveText(before);
  await expect(controls.getByText("3 · Frame painted")).toBeVisible();
  await controls.getByRole("button", { name: "Move the lookups" }).click();
  await expect(page.getByTestId("recalc-lookups")).toHaveText(MEASURED);
  await expect(page.getByTestId("recalc-runs").locator("li")).toHaveCount(2);

  // The merged engine showcase address opens this page.
  await page.goto("/showcases/engine/");
  await expect(page).toHaveURL(siteUrl("/showcases/recalculation/"));
});
