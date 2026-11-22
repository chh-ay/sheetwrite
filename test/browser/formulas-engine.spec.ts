import { expect, test } from "./fixtures.js";

for (const engine of ["default", "full"] as const) {
  test(`a real Grid evaluates distributions with the ${engine} engine`, async ({ page }) => {
    const wasm_requests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith(".wasm")) wasm_requests.push(request.url());
    });
    await page.goto(`/test/formulas-engine/?engine=${engine}`);
    await expect(page.locator("#formula-engine-status")).toHaveAttribute("data-status", "ready");
    const value = await page.locator("#formula-engine-value").textContent();
    if (engine === "full") {
      // Abramowitz and Stegun, Handbook of Mathematical Functions, Table 26.1:
      // the standard normal cumulative probability P(1.0) is 0.841344746068543.
      expect(Number(value)).toBeCloseTo(0.841344746068543, 12);
    } else {
      expect(value).toBe("#NAME?");
    }
    expect(wasm_requests).toHaveLength(1);
    await expect(page.locator('[aria-label="Distribution grid"] canvas')).toBeVisible();
  });
}
