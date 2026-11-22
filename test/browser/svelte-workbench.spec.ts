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

test("svelte workbench shows live presence; offline edits queue durably, survive a remount, and drain in order", async ({
  page,
}) => {
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
  await expect(page.getByTestId("presence-list").locator('li[data-present="true"]')).toHaveText(
    "Rina · HQ ops",
  );
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
  const initial_background = await background();
  await page.getByRole("button", { name: /Use (?:light|dark) theme/ }).click();
  await expect.poll(background).not.toBe(initial_background);

  // Offline edits queue durably, survive an island remount, and drain in order on reconnect.
  await toggle.click();
  await page.getByTestId("log-button").click();
  await page.getByTestId("log-button").click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toHaveAccessibleName(/^Reconnect · \d+ queued$/);
  await expect(page.getByTestId("sync-status")).toContainText("2 edits queued offline");
  await expect(page.getByTestId("pending-queue").locator("li")).toHaveText([/you-1/, /you-2/]);
  // Local rendering was never blocked: both edits are already in the model.
  await expect
    .poll(() => cellValue(page, HANDLE, "dispatch", 0, STATUS_COL))
    .toBe("Done · field sync 1");
  await expect
    .poll(() => cellValue(page, HANDLE, "dispatch", 1, STATUS_COL))
    .toBe("Done · field sync 2");

  // The new generation hydrates the pending edits from IndexedDB and
  // re-applies them locally; nothing was sent while offline.
  const recovery_scenarios = page.getByTestId("rare-actions");
  if (!(await recovery_scenarios.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await recovery_scenarios.locator("summary").click();
  }
  await page.getByTestId("remount-button").click();
  await expect(page.locator(".sw-svw")).toHaveAttribute("data-generation", "2", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("queue-count")).toHaveText("2", { timeout: 15_000 });
  await expect
    .poll(() => cellValue(page, HANDLE, "dispatch", 1, STATUS_COL), { timeout: 15_000 })
    .toBe("Done · field sync 2");

  // Reconnect through the keyboard: the switch is a real focusable control.
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("sync-status")).toContainText("All changes synced · server v2", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("queue-count")).toHaveText("0");
  await expect
    .poll(() => cellValue(page, HANDLE, "dispatch", 0, STATUS_COL))
    .toBe("Done · field sync 1");

  // 720×500 is the reflow boundary of 200% zoom on a 1440×1000 viewport.
  await page.setViewportSize({ width: 720, height: 500 });
  expect(await fitsViewport(page)).toBe(true);
});
