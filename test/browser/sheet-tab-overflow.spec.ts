import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { expect, nextFrames, test } from "./fixtures.js";

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

// When the sheet tabs overflow their strip, Excel shows scroll arrows at its
// edges, and a right-click on them lists every sheet. Here the arrows show
// only while the tabs overflow; they scroll by a sheet, and a right-click, a
// long press or the context menu key on either lists every sheet.

const SHEETS = ["Dashboard", "Orders", "Report", "Pivot", "Formulas", "History"];

async function open(page: Page, width: number, extraSheets: readonly string[]): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  await page.evaluate((names) => {
    const grid = window.__sheetwriteSpreadsheetGrid;
    for (const name of names) {
      grid?.addSheet({
        id: name.toLowerCase(),
        name,
        rowCount: 5,
        columns: [{ key: "a", header: "A", width: 80, type: "general" }],
      });
    }
    grid?.setActiveSheet("sales");
  }, extraSheets);
  await nextFrames(page);
  await nextFrames(page);
}

/** Whether the sheet's tab shows in full between the strip's arrows and + button. */
function tabInView(page: Page, name: string): Promise<boolean> {
  return page.evaluate((sheet) => {
    const strip = document.querySelector(".sheetwrite-shell-tabs");
    const tab = strip?.querySelector(`[aria-label="${sheet} sheet"]`);
    if (!strip || !tab) return false;
    const box = tab.getBoundingClientRect();
    const previous = strip
      .querySelector(".sheetwrite-tab-scroll-previous")
      ?.getBoundingClientRect();
    const end = strip.querySelector(".sheetwrite-tab-end")?.getBoundingClientRect();
    const left = Math.max(strip.getBoundingClientRect().left, previous?.right ?? 0);
    const right = Math.min(strip.getBoundingClientRect().right, end?.left ?? Infinity);
    return box.left >= left - 1 && box.right <= right + 1;
  }, name);
}

test("overflowing tabs show labelled scroll arrows that scroll by a sheet @portability", async ({
  page,
}) => {
  await open(page, 834, SHEETS);
  const strip = page.locator(".sheetwrite-shell-tabs");
  const previous = strip.getByRole("button", { name: "Show earlier sheets" });
  const next = strip.getByRole("button", { name: "Show later sheets" });
  await expect(previous).toBeVisible();
  await expect(next).toBeVisible();
  // An icon never stands alone: a name, and a tooltip that names the list too.
  await expect(next).toHaveAttribute("title", /list of all sheets/);
  await expect(previous).toHaveAttribute("aria-disabled", "true");
  for (const arrow of [previous, next]) {
    const box = await arrow.boundingBox();
    // To a hundredth of a pixel: Firefox lays out in sixtieths of a pixel.
    expect(Math.round((box?.width ?? 0) * 100) / 100).toBeGreaterThanOrEqual(24);
    expect(Math.round((box?.height ?? 0) * 100) / 100).toBeGreaterThanOrEqual(24);
  }

  expect(await tabInView(page, "History")).toBe(false);
  for (let press = 0; press < SHEETS.length && !(await tabInView(page, "History")); press++) {
    await next.click();
    await nextFrames(page);
  }
  expect(await tabInView(page, "History")).toBe(true);
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await expect(previous).toHaveAttribute("aria-disabled", "false");
});

test("a right-click, the context menu key or a long press on an arrow lists every sheet", async ({
  page,
}) => {
  await open(page, 834, SHEETS);
  const strip = page.locator(".sheetwrite-shell-tabs");
  const next = strip.getByRole("button", { name: "Show later sheets" });
  const list = page.getByRole("group", { name: "All sheets" });

  await next.click({ button: "right" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("button")).toHaveCount(9);
  await expect(list.getByRole("button", { name: "Sales" })).toHaveAttribute("aria-current", "true");
  await list.getByRole("button", { name: "Pivot" }).click();
  await expect(list).toHaveCount(0);
  expect(await page.evaluate(() => window.__sheetwriteSpreadsheetGrid?.getActiveSheet())).toBe(
    "pivot",
  );
  expect(await tabInView(page, "Pivot")).toBe(true);

  // Keyboard: the context menu key (Shift+F10) on the focused arrow, then the arrow keys.
  await next.focus();
  await page.keyboard.press("Shift+F10");
  await expect(list).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.__sheetwriteSpreadsheetGrid?.getActiveSheet())).toBe(
    "history",
  );
  expect(await tabInView(page, "History")).toBe(true);

  // Touch: a press held on the arrow.
  await next.dispatchEvent("pointerdown", { pointerType: "touch", clientX: 0, clientY: 0 });
  await expect(list).toBeVisible({ timeout: 2_000 });
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
});

test("tabs that fit show no scroll arrows", async ({ page }) => {
  await open(page, 1_440, []);
  await expect(page.locator(".sheetwrite-shell-tabs .sheetwrite-tab-scroll")).toHaveCount(2);
  await expect(page.locator(".sheetwrite-shell-tabs .sheetwrite-tab-scroll:visible")).toHaveCount(
    0,
  );
});
