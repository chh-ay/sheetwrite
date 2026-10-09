import { expect, type Page, test } from "@playwright/test";
import {
  ANALYTICS_EXPECTED,
  ANALYTICS_ROWS,
  analyticsArr,
} from "../../docs/src/showcases/scenarios/analytics.js";
import { siteUrl } from "./playwright.config.js";

const REACT_URL = siteUrl("/react/");
const GRID = ".sw-demo-grid .sheetwrite";

const TOKYO_ROWS = ANALYTICS_EXPECTED.marketRowCounts.Tokyo ?? 0;
const TOKYO_ARR = ANALYTICS_EXPECTED.marketTotals.Tokyo ?? 0;
const TOTAL_ARR = ANALYTICS_EXPECTED.totalArr;

function en(value: number): string {
  return value.toLocaleString("en-US");
}

interface BrowserErrors {
  console: string[];
  page: string[];
}

function collectErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  return errors;
}

async function expectNoErrors(page: Page, errors: BrowserErrors): Promise<void> {
  await page.waitForTimeout(50);
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
}

/** Ready gate: the adapter published generation 1 and the canvas is attached. */
async function openWorkbench(page: Page): Promise<void> {
  await page.goto(REACT_URL);
  await page.waitForSelector(`${GRID} canvas`, { state: "attached", timeout: 20_000 });
  await expect(page.getByTestId("generation")).toHaveText("1", { timeout: 20_000 });
}

async function gridcellTexts(page: Page): Promise<string[]> {
  return page.locator(`${GRID} [role="gridcell"]`).allTextContents();
}

async function selectOption(page: Page, control: "Market" | "Segment", label: string) {
  await page
    .locator(".sw-demo-controlbar__controls .sw-demo-select", { hasText: control })
    .locator(".sw-demo-select__trigger")
    .click();
  await page.getByRole("option", { name: label }).click();
}

/** Undo/Redo live beside the causal state rail, outside the Grid's own toolbar. */
function editButton(page: Page, name: "Undo" | "Redo") {
  return page.getByRole("toolbar", { name: "History controls" }).getByRole("button", { name });
}

async function openTools(page: Page): Promise<void> {
  const shelf = page.locator("details.sw-rwb-tools");
  if ((await shelf.getAttribute("open")) === null) {
    await shelf.locator("summary").click();
  }
  await expect(shelf).toHaveAttribute("open", "");
}

test.describe("react workbench — controlled analytics", () => {
  test("filters, aggregates, and derived summaries follow controlled state", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = collectErrors(page);
    await openWorkbench(page);

    // The editable Grid is on the first screen.
    await expect(page.locator(GRID)).toBeInViewport();
    await expect(
      page.getByRole("complementary", { name: "Controlled analytics state" }),
    ).toBeVisible();

    // Canonical boot state straight from the shared scenario contract.
    await expect(page.getByTestId("rows-visible")).toHaveText(en(ANALYTICS_ROWS));
    await expect
      .poll(() => gridcellTexts(page), { timeout: 15_000 })
      .toContain(ANALYTICS_EXPECTED.firstDataCell.text);
    await expect(page.getByTestId("kpi-total")).toHaveAttribute("data-raw", String(TOTAL_ARR), {
      timeout: 15_000,
    });
    await expect(page.getByTestId("kpi-market")).toHaveAttribute("data-raw", String(TOTAL_ARR));

    // Market filter: view narrows and the focused KPI swaps to the SUMIF row.
    await selectOption(page, "Market", "Tokyo");
    await expect(page.getByTestId("rows-visible")).toHaveText(en(TOKYO_ROWS));
    await expect(page.getByTestId("kpi-market")).toHaveAttribute("data-raw", String(TOKYO_ARR));

    // Segment filter composes (AND) with the market filter.
    await selectOption(page, "Segment", "Enterprise");
    const composed = Number(
      (await page.getByTestId("rows-visible").innerText()).replaceAll(",", ""),
    );
    expect(composed).toBeGreaterThan(0);
    expect(composed).toBeLessThan(TOKYO_ROWS);

    // Reset view restores the canonical query state.
    await page.getByRole("button", { name: "Reset view" }).click();
    await expect(page.getByTestId("rows-visible")).toHaveText(en(ANALYTICS_ROWS));
    await expect(page.getByTestId("kpi-market")).toHaveAttribute("data-raw", String(TOTAL_ARR));

    await expectNoErrors(page, errors);
  });

  test("controlled formula entry recalculates cell and KPI formulas", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = collectErrors(page);
    await openWorkbench(page);

    let expectedMax = 0;
    for (let row = 0; row < ANALYTICS_ROWS; row++) {
      expectedMax = Math.max(expectedMax, analyticsArr(row));
    }

    // Selecting a cell reconciles the controlled formula input from the grid.
    await page.locator(GRID).focus();
    await page.keyboard.press("ControlOrMeta+Home");
    for (let col = 0; col < 4; col++) await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("selection-address")).toHaveText("R1 C5");
    await expect(page.getByTestId("formula-input")).toHaveValue("5");

    // A committed formula evaluates against the named range immediately.
    await page.getByTestId("formula-input").fill("=MAX(ANNUAL_ARR)");
    await page.getByTestId("formula-input").press("Enter");
    await expect
      .poll(async () => (await gridcellTexts(page)).join("\u0000"), { timeout: 15_000 })
      .toContain(String(expectedMax));

    // Editing an ARR literal recalculates both the formula cell and the KPIs.
    await page.locator(GRID).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("formula-input")).toHaveValue("480");
    await page.getByTestId("formula-input").fill("1000000");
    await page.getByTestId("formula-input").press("Enter");
    await expect(page.getByTestId("kpi-total")).toHaveAttribute(
      "data-raw",
      String(TOTAL_ARR - 480 + 1_000_000),
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("kpi-largest")).toHaveAttribute("data-raw", "1000000");
    await expect
      .poll(async () => (await gridcellTexts(page)).join("\u0000"), { timeout: 15_000 })
      .toContain("1000000");

    await expectNoErrors(page, errors);
  });

  test("grid-native clipboard edits go through React history and undo", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const errors = collectErrors(page);
    await openWorkbench(page);

    // Copy the first account (column B) over the second with the keyboard.
    await page.locator(GRID).focus();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("formula-input")).toHaveValue("Account 000001");
    await page.keyboard.press("ControlOrMeta+c");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15_000 })
      .toContain("Account 000001");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+v");
    await expect
      .poll(
        async () => (await gridcellTexts(page)).filter((text) => text === "Account 000001").length,
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(2);
    await editButton(page, "Undo").click();
    await expect.poll(() => gridcellTexts(page), { timeout: 15_000 }).toContain("Account 000002");

    await expectNoErrors(page, errors);
  });

  test("lifecycle: reload reconciles controlled state, live options do not reset, renderer swap does", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openWorkbench(page);
    await openTools(page);

    // Controlled state set before the reset…
    await selectOption(page, "Market", "Tokyo");
    await expect(page.getByTestId("rows-visible")).toHaveText(en(TOKYO_ROWS));

    // …survives an input-reset: the fresh grid instance is reconciled from React.
    await page.getByRole("button", { name: "Reload dataset" }).click();
    await expect(page.getByTestId("generation")).toHaveText("2", { timeout: 20_000 });
    await expect(page.getByTestId("ready-reason")).toHaveText("input-reset");
    await expect(page.getByTestId("rows-visible")).toHaveText(en(TOKYO_ROWS), { timeout: 15_000 });
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
    await expect(readOnlyToggle).toHaveAttribute("aria-pressed", "false");

    // Renderer selection is reset-sensitive and reported through React state.
    await page.getByRole("radio", { name: "Web Worker" }).click();
    await expect(page.getByTestId("generation")).toHaveText("3", { timeout: 20_000 });
    await expect(page.getByTestId("ready-reason")).toHaveText("renderer-reset");
    await expect(page.getByTestId("renderer")).toContainText("Active: Web Worker", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("renderer")).toHaveAttribute("data-fallback-count", "0");
    // The worker owns the canvas (OffscreenCanvas), so 2D-context sampling is
    // impossible; presented frames are proven by the worker frame counter.
    await expect
      .poll(
        async () =>
          Number(
            (await page.locator(`${GRID} .sheetwrite-canvas`).getAttribute("data-worker-frame")) ??
              0,
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);

    await expectNoErrors(page, errors);
  });
});
