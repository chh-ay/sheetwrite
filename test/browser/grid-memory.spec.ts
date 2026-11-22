import type { CDPSession, Page } from "@playwright/test";

import { expect, test } from "./fixtures.js";

const FIXTURE_URL = "/test/grid-memory/";
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

async function retained_heap_bytes(session: CDPSession): Promise<number> {
  for (let turn = 0; turn < GC_TURNS; turn++) {
    await session.send("HeapProfiler.collectGarbage");
  }
  const usage = await session.send("Runtime.getHeapUsage");

  return usage.usedSize;
}

async function run_action(page: Page, label: string, status: string): Promise<void> {
  await page.getByRole("button", { name: label }).click();
  await expect(page.locator(STATUS)).toHaveAttribute("data-status", status, {
    timeout: FIXTURE_TIMEOUT_MS,
  });
}

async function cached_strings(page: Page): Promise<number> {
  return Number(await page.locator(STRINGS).getAttribute("data-entries"));
}
// Chromium only: the heap is read through the Chromium DevTools protocol.
test("trimMemory lowers retained heap and keeps the document and the visible grid", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1_000, height: 800 });

  await page.goto(FIXTURE_URL);
  await expect(page.locator(STATUS)).toHaveAttribute("data-status", "ready", {
    timeout: FIXTURE_TIMEOUT_MS,
  });
  const loaded_document = await page.locator(DOCUMENT).getAttribute("data-digest");
  expect(loaded_document).toMatch(/^[0-9a-f]{64}$/u);

  await run_action(page, "Scroll through", "scrolled");
  const session = await page.context().newCDPSession(page);
  const heap_before = await retained_heap_bytes(session);
  const pixels_before = await page.locator(HOST).screenshot();
  const document_before = await page.locator(DOCUMENT).getAttribute("data-digest");
  const strings_before = await cached_strings(page);

  await run_action(page, "Trim memory", "trimmed");
  const heap_after = await retained_heap_bytes(session);
  const pixels_after = await page.locator(HOST).screenshot();
  const document_after = await page.locator(DOCUMENT).getAttribute("data-digest");
  const strings_after = await cached_strings(page);

  test.info().annotations.push({
    type: "retained heap",
    description: `${heap_before} B before, ${heap_after} B after trimMemory(); cached strings ${strings_before} before, ${strings_after} after`,
  });
  expect(document_before).toBe(loaded_document);
  expect(document_after).toBe(document_before);
  expect(pixels_after.equals(pixels_before)).toBe(true);
  expect(strings_before).toBeGreaterThan(MIN_CACHED_STRINGS);
  expect(strings_after).toBeLessThan(MAX_STRINGS_AFTER_TRIM);
  expect(heap_before - heap_after).toBeGreaterThan(MIN_TRIMMED_BYTES);
});
