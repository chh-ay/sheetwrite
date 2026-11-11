import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { cellValue, expect, fitsViewport, gridCellTexts, test } from "./fixtures.js";

declare global {
  interface Window {
    __sheetwriteSvelteGrid?: Grid;
  }
}

/**
 * The /svelte/ offline workbench: durable pending queue, connectivity,
 * reconnect drain, presence, conflict recovery, and remount persistence.
 * Expected values mirror docs/src/showcases/scenarios/offline.ts: local edits
 * write "Done · field sync N" to the status column (3) of row N-1, and the
 * colleague writes "Crew HQ-1" to the crew column (5) of row 7.
 */

const HANDLE = "__sheetwriteSvelteGrid";
const STATUS_COL = 3;
const CREW_COL = 5;
const COLLEAGUE_ROW = 7;
const MIN_CHIP_CONTRAST = 4.5;

async function open(page: Page): Promise<void> {
  await page.goto("/svelte/");
  await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v0", {
    timeout: 15_000,
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__sheetwriteSvelteGrid)), { timeout: 15_000 })
    .toBe(true);
}

async function goOfflineAndLog(page: Page, edits: number): Promise<void> {
  await page.getByTestId("connection-toggle").click();
  for (let edit = 0; edit < edits; edit++) await page.getByTestId("log-button").click();
}

async function revealRecoveryScenarios(page: Page): Promise<void> {
  const details = page.getByTestId("rare-actions");
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.locator("summary").click();
  }
}

/** The colleague's label sits inside the grid, off the value band, readable and inert. */
async function assertPresenceGeometry(page: Page): Promise<void> {
  await page.evaluate(
    ({ row, col }) => window.__sheetwriteSvelteGrid?.scrollToCell({ sheet: "dispatch", row, col }),
    { row: COLLEAGUE_ROW, col: CREW_COL },
  );
  const range = page.locator('[data-sheetwrite-presence="hq-ops"]').first();
  const label = page.locator('[data-sheetwrite-presence-label="hq-ops"]');
  await expect(range).toBeVisible({ timeout: 15_000 });
  await expect(label).toHaveCount(1);
  await expect(label).toHaveAttribute("role", "img");
  await expect(label).toHaveAttribute("aria-label", "Remote selection: Rina · HQ ops");
  await expect(range).toHaveText("");

  const [gridBox, rangeBox, labelBox] = await Promise.all([
    page.locator(".sheetwrite").first().boundingBox(),
    range.boundingBox(),
    label.boundingBox(),
  ]);
  if (!gridBox || !rangeBox || !labelBox) throw new Error("presence has no layout");
  expect(labelBox.x).toBeGreaterThanOrEqual(gridBox.x);
  expect(labelBox.y).toBeGreaterThanOrEqual(gridBox.y);
  expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(gridBox.x + gridBox.width + 0.5);
  expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(gridBox.y + gridBox.height + 0.5);

  const kind = await label.getAttribute("data-presence-kind");
  if (kind === "marker") {
    await expect(label).toHaveText("");
    expect(labelBox.y + labelBox.height).toBeLessThan(rangeBox.y + rangeBox.height / 2);
  } else {
    expect(kind).toBe("chip");
    const valueBandTop = rangeBox.y + Math.max(0, (rangeBox.height - 16) / 2);
    const valueBandBottom = valueBandTop + Math.min(16, rangeBox.height);
    expect(labelBox.y + labelBox.height <= valueBandTop || labelBox.y >= valueBandBottom).toBe(
      true,
    );
  }

  const appearance = await label.evaluate((element) => {
    const style = getComputedStyle(element);
    const channels = (value: string) => {
      const [red = 0, green = 0, blue = 0, alpha = 1] = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return { rgb: [red, green, blue], alpha };
    };
    const luminance = (rgb: number[]) => {
      const [red = 0, green = 0, blue = 0] = rgb.map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const background = channels(style.backgroundColor);
    const lights = [luminance(background.rgb), luminance(channels(style.color).rgb)];
    return {
      alpha: background.alpha,
      contrast: (Math.max(...lights) + 0.05) / (Math.min(...lights) + 0.05),
      pointerEvents: style.pointerEvents,
    };
  });
  expect(appearance.alpha).toBeGreaterThanOrEqual(0.95);
  if (kind === "chip") expect(appearance.contrast).toBeGreaterThanOrEqual(MIN_CHIP_CONTRAST);
  expect(appearance.pointerEvents).toBe("none");
}

test("svelte workbench boots synced and shows live presence in every theme and size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator(".sw-svw .sw-demo-grid")).toBeInViewport();
  // The ARIA mirror windows the scrollable pane; the frozen ticket column is
  // read from the store.
  await expect.poll(() => gridCellTexts(page), { timeout: 15_000 }).toContain("Riverside depot");
  await expect.poll(() => cellValue(page, HANDLE, "dispatch", 0, 0)).toBe("FT-0001");

  const toggle = page.getByTestId("connection-toggle");
  await expect(toggle).toHaveRole("switch");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(toggle).toHaveAccessibleName("Connected · Go offline");
  await expect(page.getByTestId("sync-status")).toHaveRole("status");
  await expect(page.getByTestId("activity-feed")).toHaveAttribute("aria-live", "polite");
  await expect(page.getByTestId("presence-list")).toContainText("You · Field tablet");
  await expect(page.getByTestId("presence-list")).toContainText("Rina · HQ ops");
  await assertPresenceGeometry(page);

  // theme-change reseeds the toolbar palette with the colours the Grid now paints.
  const toolbar = page.locator(".sw-svw .sheetwrite-command-toolbar");
  const background = () => toolbar.evaluate((element) => getComputedStyle(element).backgroundColor);
  const initialBackground = await background();
  await page.getByRole("button", { name: /Use (?:light|dark) theme/ }).click();
  await expect.poll(background).not.toBe(initialBackground);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await assertPresenceGeometry(page);

  // 720×500 is the reflow boundary of 200% zoom on a 1440×1000 viewport.
  await page.setViewportSize({ width: 720, height: 500 });
  await assertPresenceGeometry(page);
  expect(await fitsViewport(page)).toBe(true);
});

test("offline edits queue durably and drain in order on reconnect", async ({ page }) => {
  await open(page);
  await goOfflineAndLog(page, 2);
  const toggle = page.getByTestId("connection-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toHaveAccessibleName(/^Reconnect · \d+ queued$/);
  await expect(page.getByTestId("sync-status")).toContainText("2 edits queued offline");
  const queued = page.getByTestId("pending-queue").locator("li");
  await expect(queued).toHaveText([/you-1/, /you-2/]);
  // Local rendering was never blocked: both edits are already in the model.
  await expect
    .poll(() => cellValue(page, HANDLE, "dispatch", 0, STATUS_COL))
    .toBe("Done · field sync 1");
  await expect
    .poll(() => cellValue(page, HANDLE, "dispatch", 1, STATUS_COL))
    .toBe("Done · field sync 2");

  // Reconnect through the keyboard: the switch is a real focusable control.
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v2", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("queue-count")).toHaveText("0");
});

test("the durable outbox survives a full island remount while offline", async ({ page }) => {
  await open(page);
  await goOfflineAndLog(page, 1);
  await expect(page.getByTestId("queue-count")).toHaveText("1");
  await revealRecoveryScenarios(page);
  await page.getByTestId("remount-button").click();
  await expect(page.locator(".sw-svw")).toHaveAttribute("data-generation", "2", {
    timeout: 15_000,
  });

  // The new generation hydrates the pending edit from IndexedDB and re-applies
  // it locally; nothing was sent while offline.
  await expect(page.getByTestId("queue-count")).toHaveText("1", { timeout: 15_000 });
  await expect
    .poll(() => cellValue(page, HANDLE, "dispatch", 0, STATUS_COL), { timeout: 15_000 })
    .toBe("Done · field sync 1");
  await page.getByTestId("connection-toggle").click();
  await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v1", {
    timeout: 15_000,
  });
  await expect
    .poll(() => cellValue(page, HANDLE, "dispatch", 0, STATUS_COL))
    .toBe("Done · field sync 1");
});

test("reconnecting onto concurrent server work surfaces a conflict that merge resolves", async ({
  page,
}) => {
  await open(page);
  await goOfflineAndLog(page, 1);
  await revealRecoveryScenarios(page);
  await page.getByTestId("colleague-button").click();
  await expect(page.getByTestId("activity-feed")).toContainText(
    "committed server v1 while you're offline",
  );

  await page.getByTestId("connection-toggle").click();
  const conflictPanel = page.getByTestId("conflict-panel");
  await expect(conflictPanel).toContainText("you-1", { timeout: 15_000 });
  await expect(page.getByTestId("sync-status")).toContainText("conflict", { ignoreCase: true });
  await expect(
    page.getByTestId("pending-queue").locator('li[data-status="conflicted"]'),
  ).toHaveCount(1);

  await page.getByTestId("merge-button").click();
  await expect(conflictPanel).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v2", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("queue-count")).toHaveText("0");
  // Both the remote crew assignment and the queued local status edit converge.
  await expect
    .poll(() => cellValue(page, HANDLE, "dispatch", COLLEAGUE_ROW, CREW_COL))
    .toBe("Crew HQ-1");
  await expect
    .poll(() => cellValue(page, HANDLE, "dispatch", 0, STATUS_COL))
    .toBe("Done · field sync 1");
});
