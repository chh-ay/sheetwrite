import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.js";

// The formula assist showcase (#801): ghost text in the formula bar, its keys,
// and the recorded demo, which loads only when the reader reaches it.

const MEDIA = /\/media\/formula-assist\/.+\.(mp4|webm)$/;

async function openShowcase(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/showcases/formula-assist/");
  await expect(page.getByRole("button", { name: "Finance's total" })).toBeEnabled();
}

test("suggests a row total from its neighbours and Tab takes it @portability", async ({ page }) => {
  await openShowcase(page, 1440, 900);
  await page.getByRole("button", { name: "Finance's total" }).click();
  const bar = page.getByRole("textbox", { name: "Formula bar" });
  await expect(bar).toBeFocused();

  await page.keyboard.type("=");
  const ghost = page.locator(".sheetwrite-formula-ghost");
  await expect(ghost).toHaveText("SUM(B6:G6)");
  await page.keyboard.press("Tab");
  await expect(bar).toHaveValue("=SUM(B6:G6)");
  await expect(ghost).toHaveCount(0);
});

test("loads the demo video only when the reader reaches it, without layout shift", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    if (MEDIA.test(request.url())) requested.push(request.url());
  });
  await openShowcase(page, 1440, 900);
  await page.evaluate(() => {
    const shifts: number[] = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if ("value" in entry && typeof entry.value === "number") shifts.push(entry.value);
      }
    }).observe({ type: "layout-shift", buffered: true });
    Object.assign(window, { __layoutShifts: shifts });
  });
  expect(requested).toEqual([]);

  const frame = page.locator(".sw-demo-video__frame");
  await frame.scrollIntoViewIfNeeded();
  await expect(page.locator("video.sw-demo-video__video")).toBeAttached();
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  expect(requested.every((url) => url.includes("wide-loop"))).toBe(true);

  const shift = await page.evaluate(() =>
    Reflect.get(window, "__layoutShifts").reduce((sum: number, value: number) => sum + value, 0),
  );
  expect(shift).toBe(0);
});

test("plays the narrow take at 390 px", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    if (MEDIA.test(request.url())) requested.push(request.url());
  });
  await openShowcase(page, 390, 844);
  await page.locator(".sw-demo-video__frame").scrollIntoViewIfNeeded();
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  expect(requested.every((url) => url.includes("narrow-loop"))).toBe(true);
  await expect(page.locator(".sw-demo-video__poster--narrow")).toBeVisible();
});
