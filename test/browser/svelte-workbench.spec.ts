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

test("svelte workbench boots synced and shows live presence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
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
  await expect(page.getByTestId("presence-list")).toContainText("Rina · HQ ops");
  // The colleague's selection is painted on the grid, labelled and inert.
  await page.evaluate(
    ({ row, col }) => window.__sheetwriteSvelteGrid?.scrollToCell({ sheet: "dispatch", row, col }),
    { row: COLLEAGUE_ROW, col: CREW_COL },
  );
  await expect(page.locator('[data-sheetwrite-presence="hq-ops"]').first()).toBeVisible({
    timeout: 15_000,
  });
  const label = page.locator('[data-sheetwrite-presence-label="hq-ops"]');
  await expect(label).toHaveAttribute("aria-label", "Remote selection: Rina · HQ ops");
  await expect(label).toHaveCSS("pointer-events", "none");

  // theme-change reseeds the toolbar palette with the colours the Grid now paints.
  const toolbar = page.locator(".sw-svw .sheetwrite-command-toolbar");
  const background = () => toolbar.evaluate((element) => getComputedStyle(element).backgroundColor);
  const initialBackground = await background();
  await page.getByRole("button", { name: /Use (?:light|dark) theme/ }).click();
  await expect.poll(background).not.toBe(initialBackground);
  // 720×500 is the reflow boundary of 200% zoom on a 1440×1000 viewport.
  await page.setViewportSize({ width: 720, height: 500 });
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
