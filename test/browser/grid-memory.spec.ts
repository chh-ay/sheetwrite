import { type CDPSession, expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const FIXTURE_URL = siteUrl("/test/grid-memory/");
const HOST = '[aria-label="Grid memory browser fixture"]';
const STATUS = "#grid-memory-status";
const DOCUMENT = "#grid-memory-document";
const STRINGS = "#grid-memory-strings";
const GC_TURNS = 3;
// The fixture puts about 60,000 strings in the window string cache, about
// 2.4 MiB in Chromium. The bound leaves room for heap noise.
const MIN_TRIMMED_BYTES = 1024 * 1024;
const MIN_CACHED_STRINGS = 50_000;
// The window painted after the trim holds a few hundred strings.
const MAX_STRINGS_AFTER_TRIM = 1_000;
const FIXTURE_TIMEOUT_MS = 90_000;

async function retainedHeapBytes(session: CDPSession): Promise<number> {
  for (let turn = 0; turn < GC_TURNS; turn++) {
    await session.send("HeapProfiler.collectGarbage");
  }
  const usage = await session.send("Runtime.getHeapUsage");

  return usage.usedSize;
}

async function runAction(page: Page, label: string, status: string): Promise<void> {
  await page.getByRole("button", { name: label }).click();
  await expect(page.locator(STATUS)).toHaveAttribute("data-status", status, {
    timeout: FIXTURE_TIMEOUT_MS,
  });
}

async function cachedStrings(page: Page): Promise<number> {
  return Number(await page.locator(STRINGS).getAttribute("data-entries"));
}
test("trimMemory lowers retained heap and keeps the document and the visible grid", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "The heap is read through the Chromium DevTools protocol.");
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1_000, height: 800 });

  await page.goto(FIXTURE_URL);
  await expect(page.locator(STATUS)).toHaveAttribute("data-status", "ready", {
    timeout: FIXTURE_TIMEOUT_MS,
  });
  const loadedDocument = await page.locator(DOCUMENT).getAttribute("data-digest");
  expect(loadedDocument).toMatch(/^[0-9a-f]{64}$/u);

  await runAction(page, "Scroll through", "scrolled");
  const session = await page.context().newCDPSession(page);
  const heapBefore = await retainedHeapBytes(session);
  const pixelsBefore = await page.locator(HOST).screenshot();
  const documentBefore = await page.locator(DOCUMENT).getAttribute("data-digest");
  const stringsBefore = await cachedStrings(page);

  await runAction(page, "Trim memory", "trimmed");
  const heapAfter = await retainedHeapBytes(session);
  const pixelsAfter = await page.locator(HOST).screenshot();
  const documentAfter = await page.locator(DOCUMENT).getAttribute("data-digest");
  const stringsAfter = await cachedStrings(page);

  test.info().annotations.push({
    type: "retained heap",
    description: `${heapBefore} B before, ${heapAfter} B after trimMemory(); cached strings ${stringsBefore} before, ${stringsAfter} after`,
  });
  expect(documentBefore).toBe(loadedDocument);
  expect(documentAfter).toBe(documentBefore);
  expect(pixelsAfter.equals(pixelsBefore)).toBe(true);
  expect(stringsBefore).toBeGreaterThan(MIN_CACHED_STRINGS);
  expect(stringsAfter).toBeLessThan(MAX_STRINGS_AFTER_TRIM);
  expect(heapBefore - heapAfter).toBeGreaterThan(MIN_TRIMMED_BYTES);
  expect(errors).toEqual([]);
});
