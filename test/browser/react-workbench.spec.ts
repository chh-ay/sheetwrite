import type { Page } from "@playwright/test";

import {
  ANALYTICS_EXPECTED,
  ANALYTICS_ROWS,
} from "../../docs/src/showcases/scenarios/analytics.js";
import { expect, gridCellTexts, test } from "./fixtures.js";

// The /react/ controlled analytics workbench in a real browser. The adapter's
// props, events and reconciliation are owned by packages/react/test.

const GRID = ".sw-demo-grid .sheetwrite";
const TOKYO_ROWS = ANALYTICS_EXPECTED.marketRowCounts.Tokyo ?? 0;
const TOKYO_ARR = ANALYTICS_EXPECTED.marketTotals.Tokyo ?? 0;

/** Ready gate: the adapter published generation 1 and the canvas is attached. */
async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/react/");
  await page.waitForSelector(`${GRID} canvas`, { state: "attached", timeout: 20_000 });
  await expect(page.getByTestId("generation")).toHaveText("1", { timeout: 20_000 });
}

function expectRowsVisible(page: Page, rows: number) {
  return expect(page.getByTestId("rows-visible")).toHaveText(rows.toLocaleString("en-US"), {
    timeout: 15_000,
  });
}

test("clipboard edits go through React history; controlled filters survive a dataset reload; read-only is live, a renderer swap resets", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await expect(page.locator(GRID)).toBeInViewport();
  // The page owns the one main landmark; the workbench inside it adds none.
  await expect(page.getByRole("main")).toHaveCount(1);
  await expectRowsVisible(page, ANALYTICS_ROWS);
  await expect
    .poll(() => gridCellTexts(page, GRID), { timeout: 15_000 })
    .toContain(ANALYTICS_EXPECTED.firstDataCell.text);
  await expect(page.getByTestId("kpi-total")).toHaveAttribute(
    "data-raw",
    String(ANALYTICS_EXPECTED.totalArr),
    { timeout: 15_000 },
  );

  // Grid-native clipboard edits go through React history, whose Undo reverts them.
  await page.locator(GRID).focus();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("formula-input")).toHaveValue("Alder Quay Logistics");
  await page.keyboard.press("ControlOrMeta+c");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15_000 })
    .toContain("Alder Quay Logistics");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ControlOrMeta+v");
  await expect
    .poll(
      async () =>
        (await gridCellTexts(page, GRID)).filter((text) => text === "Alder Quay Logistics").length,
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(2);
  await page
    .getByRole("toolbar", { name: "History controls" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect
    .poll(() => gridCellTexts(page, GRID), { timeout: 15_000 })
    .toContain("Beacon Quay Logistics");

  // The market filter narrows the view and the focused KPI swaps to its SUMIF row.
  await page
    .locator(".sw-demo-controlbar__controls .sw-demo-select", { hasText: "Market" })
    .locator(".sw-demo-select__trigger")
    .click();
  await page.getByRole("option", { name: "Tokyo" }).click();
  await expectRowsVisible(page, TOKYO_ROWS);
  await expect(page.getByTestId("kpi-market")).toHaveAttribute("data-raw", String(TOKYO_ARR));

  // Controlled state survives an input-reset: the fresh grid is reconciled from React.
  await page.locator("details.sw-rwb-tools summary").click();
  await page.getByRole("button", { name: "Reload dataset" }).click();
  await expect(page.getByTestId("generation")).toHaveText("2", { timeout: 20_000 });
  await expect(page.getByTestId("ready-reason")).toHaveText("input-reset");
  await expectRowsVisible(page, TOKYO_ROWS);
  await expect(page.getByTestId("kpi-market")).toHaveAttribute("data-raw", String(TOKYO_ARR), {
    timeout: 15_000,
  });

  // Read-only is a live option: no new generation, editing surface disabled.
  const readOnlyToggle = page.getByRole("button", { name: "Read-only" });
  await readOnlyToggle.click();
  await expect(readOnlyToggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("formula-input")).toBeDisabled();
  await expect(page.getByTestId("generation")).toHaveText("2");
  await readOnlyToggle.click();

  // Renderer selection is reset-sensitive and reported through React state.
  await page.getByRole("radio", { name: "Web Worker" }).click();
  await expect(page.getByTestId("generation")).toHaveText("3", { timeout: 20_000 });
  await expect(page.getByTestId("ready-reason")).toHaveText("renderer-reset");
  await expect(page.getByTestId("renderer")).toContainText("Active: Web Worker", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("renderer")).toHaveAttribute("data-fallback-count", "0");
  // The Worker owns the canvas, so presented frames show in its frame counter.
  await expect
    .poll(
      async () =>
        Number(
          (await page.locator(`${GRID} .sheetwrite-canvas`).getAttribute("data-worker-frame")) ?? 0,
        ),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
});
