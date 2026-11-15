import { test as base, expect, type Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { hasOpaqueForeground } from "./canvas-assertions.js";

export { expect };
export { siteUrl } from "./playwright.config.js";

/**
 * Every spec's `page` fails its test when the page throws, logs a console
 * error, or a Worker reports an error. A test that provokes errors on purpose
 * opts out with `test.use({ allowErrors: true })`.
 */
export const test = base.extend<{ allowErrors: boolean }>({
  allowErrors: [false, { option: true }],
  page: async ({ page, allowErrors }, use) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
    page.context().on("weberror", (error) => errors.push(`worker: ${error.error().message}`));
    await use(page);
    if (!allowErrors) expect(errors).toEqual([]);
  },
});

/** Interactive docs steps need attached listeners; the root component marks hydration. */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15_000 });
}

/** Whether the document fits the viewport width without a sideways scroll. */
export function fitsViewport(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
}

/** Waits two animation frames, so layout and paint of the last change have happened. */
export function nextFrames(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const { promise, resolve } = Promise.withResolvers<void>();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    return promise;
  });
}

/** Text of the cells in a grid's ARIA mirror. */
export function gridCellTexts(page: Page, grid = ".sheetwrite"): Promise<string[]> {
  return page.locator(`${grid} [role="gridcell"]`).allTextContents();
}

/**
 * The resolved value of one cell, read from the Grid a page publishes on
 * `window` (a dotted path such as `__sheetwriteVueWorkbench.grid`).
 */
export function cellValue(
  page: Page,
  handle: string,
  sheet: string,
  row: number,
  col: number,
): Promise<unknown> {
  return page.evaluate(
    ({ handle, sheet, row, col }) => {
      const grid = handle
        .split(".")
        .reduce<unknown>((owner, key) => (owner as Record<string, unknown>)?.[key], window) as
        | Grid
        | undefined;
      return grid?.store.getCell({ sheet, row, col }).resolved ?? null;
    },
    { handle, sheet, row, col },
  );
}

/**
 * Whether the composited body of a grid canvas shows cell paint. Reads a
 * screenshot, so it also works for a Worker's OffscreenCanvas, whose 2D
 * context the page cannot reach.
 */
export async function canvasPainted(page: Page, canvas: string): Promise<boolean> {
  const element = page.locator(canvas).first();
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  if (!box || box.width <= 80 || box.height <= 56) return false;
  const image = await page.screenshot({
    clip: {
      x: box.x + 64,
      y: box.y + 40,
      width: Math.min(320, box.width - 64),
      height: Math.min(180, box.height - 40),
    },
  });
  return hasOpaqueForeground(await screenshotPixels(page, image));
}

/** RGBA pixels of a page screenshot, decoded by the browser. */
export async function screenshotPixels(page: Page, image: Buffer): Promise<Uint8ClampedArray> {
  // Return the typed array itself: Playwright sends it as one binary payload,
  // while a plain number array serializes every channel value separately,
  // which can exceed the poll timeout on a loaded Firefox page.
  return page.evaluate(async (encoded) => {
    const source = new Image();
    source.src = `data:image/png;base64,${encoded}`;
    await source.decode();
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("A 2D canvas context is unavailable");
    context.drawImage(source, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  }, image.toString("base64"));
}
