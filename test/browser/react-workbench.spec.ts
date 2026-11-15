import type { Page } from "@playwright/test";

import {
  ANALYTICS_EXPECTED,
  ANALYTICS_ROWS,
  analyticsArr,
  analyticsSeats,
} from "../../docs/src/showcases/scenarios/analytics.js";
import { expect, gridCellTexts, test } from "./fixtures.js";

// The /react/ controlled analytics workbench.

const GRID = ".sw-demo-grid .sheetwrite";
const TOKYO_ROWS = ANALYTICS_EXPECTED.marketRowCounts.Tokyo ?? 0;
const TOKYO_ARR = ANALYTICS_EXPECTED.marketTotals.Tokyo ?? 0;
const TOTAL_ARR = ANALYTICS_EXPECTED.totalArr;
const SEATS_COLUMN = 4;

/** Ready gate: the adapter published generation 1 and the canvas is attached. */
async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/react/");
  await page.waitForSelector(`${GRID} canvas`, { state: "attached", timeout: 20_000 });
  await expect(page.getByTestId("generation")).toHaveText("1", { timeout: 20_000 });
}

async function selectOption(page: Page, control: "Market" | "Segment", label: string) {
  await page
    .locator(".sw-demo-controlbar__controls .sw-demo-select", { hasText: control })
    .locator(".sw-demo-select__trigger")
    .click();
  await page.getByRole("option", { name: label }).click();
}

function expectRowsVisible(page: Page, rows: number) {
  return expect(page.getByTestId("rows-visible")).toHaveText(rows.toLocaleString("en-US"), {
    timeout: 15_000,
  });
}

test("filters, aggregates, and derived summaries follow controlled state", async ({ page }) => {
  await open(page);
  await expect(page.locator(GRID)).toBeInViewport();
  // The page owns the one main landmark; the workbench inside it adds none.
  await expect(page.getByRole("main")).toHaveCount(1);
  await expectRowsVisible(page, ANALYTICS_ROWS);
  await expect
    .poll(() => gridCellTexts(page, GRID), { timeout: 15_000 })
    .toContain(ANALYTICS_EXPECTED.firstDataCell.text);
  await expect(page.getByTestId("kpi-total")).toHaveAttribute("data-raw", String(TOTAL_ARR), {
    timeout: 15_000,
  });

  // The market filter narrows the view and the focused KPI swaps to its SUMIF row.
  await selectOption(page, "Market", "Tokyo");
  await expectRowsVisible(page, TOKYO_ROWS);
  await expect(page.getByTestId("kpi-market")).toHaveAttribute("data-raw", String(TOKYO_ARR));
  // The segment filter composes (AND) with the market filter.
  await selectOption(page, "Segment", "Enterprise");
  const composed = Number((await page.getByTestId("rows-visible").innerText()).replaceAll(",", ""));
  expect(composed).toBeGreaterThan(0);
  expect(composed).toBeLessThan(TOKYO_ROWS);

  await page.getByRole("button", { name: "Reset view" }).click();
  await expectRowsVisible(page, ANALYTICS_ROWS);
  await expect(page.getByTestId("kpi-market")).toHaveAttribute("data-raw", String(TOTAL_ARR));
});

test("controlled formula entry recalculates cell and KPI formulas", async ({ page }) => {
  await open(page);
  let expectedMax = 0;
  for (let row = 0; row < ANALYTICS_ROWS; row++) {
    expectedMax = Math.max(expectedMax, analyticsArr(row));
  }
  const formulaInput = page.getByTestId("formula-input");
  const visibleText = async () => (await gridCellTexts(page, GRID)).join("\u0000");

  // Selecting a cell reconciles the controlled formula input from the grid.
  await page.locator(GRID).focus();
  await page.keyboard.press("ControlOrMeta+Home");
  for (let col = 0; col < SEATS_COLUMN; col++) await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("selection-address")).toHaveText("R1 C5");
  await expect(formulaInput).toHaveValue(String(analyticsSeats(0)));

  // A committed formula evaluates against the named range immediately.
  await formulaInput.fill("=MAX(ANNUAL_ARR)");
  await formulaInput.press("Enter");
  await expect.poll(visibleText, { timeout: 15_000 }).toContain(String(expectedMax));

  // Editing an ARR literal recalculates both the formula cell and the KPIs.
  await page.locator(GRID).focus();
  await page.keyboard.press("ArrowRight");
  await expect(formulaInput).toHaveValue(String(analyticsArr(0)));
  await formulaInput.fill("1000000");
  await formulaInput.press("Enter");
  await expect(page.getByTestId("kpi-total")).toHaveAttribute(
    "data-raw",
    String(TOTAL_ARR - analyticsArr(0) + 1_000_000),
    { timeout: 15_000 },
  );
  await expect(page.getByTestId("kpi-largest")).toHaveAttribute("data-raw", "1000000");
  await expect.poll(visibleText, { timeout: 15_000 }).toContain("1000000");
});

test("grid-native clipboard edits go through React history and undo", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
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
});

test("reload reconciles controlled state, live options do not reset, renderer swap does", async ({
  page,
}) => {
  await open(page);
  await page.locator("details.sw-rwb-tools summary").click();
  await selectOption(page, "Market", "Tokyo");
  await expectRowsVisible(page, TOKYO_ROWS);

  // Controlled state survives an input-reset: the fresh grid is reconciled from React.
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
