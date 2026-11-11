import {
  LIFECYCLE_CELL,
  LIFECYCLE_RESET_CELL,
} from "../../docs/src/test-fixtures/framework-lifecycle/fixture.js";
import { canvasPainted, expect, gridCellTexts, test } from "./fixtures.js";

// Chromium only: the lifecycle is framework code, the same in every engine. Cross-engine
// boot and paint stay with the examples harness and vanilla workbench @portability tests.
for (const framework of ["react", "vue", "svelte"] as const) {
  test(`framework lifecycle: ${framework} mounts, resets, destroys, and recovers errors`, async ({
    page,
  }) => {
    await page.goto(`/test/framework-lifecycle/${framework}/`);
    const fallback = page.locator("[data-lifecycle-fallback]");
    const status = page.locator("[data-lifecycle-status]");
    const errorCount = page.locator("[data-lifecycle-errors]");
    const ready = page.locator("[data-lifecycle-ready]");
    await expect(fallback).toBeVisible();
    await expect(status).toHaveText("error", { timeout: 15_000 });
    await expect(errorCount).toHaveText("1");

    await page.locator("[data-lifecycle-retry]").click();
    await expect(status).toHaveText("ready", { timeout: 15_000 });
    await expect(ready).toHaveText("1:initial");
    await expect(errorCount).toHaveText("1");
    await expect(fallback).toHaveCount(0);
    await expect.poll(() => gridCellTexts(page), { timeout: 15_000 }).toContain(LIFECYCLE_CELL);
    await expect
      .poll(() => canvasPainted(page, ".sheetwrite canvas"), { timeout: 15_000 })
      .toBe(true);

    await page.locator("[data-lifecycle-reset]").click();
    await expect(ready).toHaveText("2:input-reset");
    await expect
      .poll(() => gridCellTexts(page), { timeout: 15_000 })
      .toContain(LIFECYCLE_RESET_CELL);
    await expect
      .poll(() => canvasPainted(page, ".sheetwrite canvas"), { timeout: 15_000 })
      .toBe(true);

    await page.locator("[data-lifecycle-unmount]").click();
    await expect(page.locator(".sheetwrite")).toHaveCount(0);
  });
}
