import { expect, test } from "@playwright/test";
import { siteUrl } from "./playwright.config.js";

for (const engine of ["default", "full"] as const) {
  test(`a real Grid evaluates distributions with the ${engine} engine`, async ({ page }) => {
    const errors: string[] = [];
    const wasmRequests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith(".wasm")) wasmRequests.push(request.url());
    });
    await page.goto(siteUrl(`/test/formulas-engine/?engine=${engine}`));
    await expect(page.locator("#formula-engine-status")).toHaveAttribute("data-status", "ready");
    const value = await page.locator("#formula-engine-value").textContent();
    if (engine === "full") {
      // Abramowitz and Stegun, Handbook of Mathematical Functions, Table 26.1:
      // the standard normal cumulative probability P(1.0) is 0.841344746068543.
      expect(Number(value)).toBeCloseTo(0.841344746068543, 12);
    } else {
      expect(value).toBe("#NAME?");
    }
    expect(wasmRequests).toHaveLength(1);
    expect(errors).toEqual([]);
    await expect(page.locator('[aria-label="Distribution grid"] canvas')).toBeVisible();
  });
}
