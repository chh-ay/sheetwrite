import { expect, test, type Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { siteUrl } from "./playwright.config.js";

declare global {
  interface Window {
    __sheetwriteAnalysisGrid?: Grid;
  }
}

const ROUTE = siteUrl("/showcases/analysis/");
const SUMMARY = "summary";
const PIVOT = "revenue-by-month";
const CHART = "revenue-trend";
/** The story's dip: EMEA in its price-change month. */
const DIP_REGION = "EMEA";
const DIP_MONTH = "2026-03";
const REVENUE_INCREASE = 50_000;

async function open(page: Page) {
  await page.goto(ROUTE);
  await expect(page.getByRole("button", { name: "Go to the order" })).toBeEnabled({
    timeout: 30_000,
  });
}

/** The pivot's value for one month and region, found by its labels, not its position. */
function pivotValue(page: Page, month: string, region: string) {
  return page.evaluate(
    ([sheet, id, rowLabel, colLabel]) => {
      const result = window.__sheetwriteAnalysisGrid?.getPivotResult(sheet, id);
      if (!result || result.status !== "ok") return null;

      const at = (row: number, col: number) => result.cells[row * result.cols + col];
      const label = result.labelCols - 1;
      // Column labels and value captions share the header rows: search them all.
      let col = -1;
      for (let c = result.labelCols; c < result.cols; c++) {
        for (let r = 0; r < result.headerRows; r++) if (at(r, c) === colLabel) col = c;
      }
      let row = -1;
      for (let r = result.headerRows; r < result.rows; r++) if (at(r, label) === rowLabel) row = r;

      return row < 0 || col < 0 ? null : Number(at(row, col));
    },
    [SUMMARY, PIVOT, month, region] as const,
  );
}

function chartAnchor(page: Page) {
  return page.evaluate(
    ([sheet, id]) =>
      window.__sheetwriteAnalysisGrid?.getCharts(sheet).find((chart) => chart.id === id)?.anchor ??
      null,
    [SUMMARY, CHART] as const,
  );
}

/** The selectable chart object; the SVG image of the chart is inside it. */
const chartObjects = (page: Page) => page.locator('[aria-roledescription="chart"]');
const chart = (page: Page) => page.getByRole("group", { name: /Monthly revenue by region/ });
const chartImage = (page: Page) =>
  chart(page).getByRole("img", { name: /Monthly revenue by region/ });

test("the pivot and its chart load from the orders without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);

  await expect(chartImage(page)).toBeVisible();
  // One series per region, named from the pivot's region labels.
  const description = await chartImage(page).locator("desc").textContent();
  for (const region of ["Americas", "APAC", DIP_REGION, "LATAM"]) {
    expect(description).toContain(region);
  }
  expect(await pivotValue(page, DIP_MONTH, DIP_REGION)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("editing an order moves its pivot total and redraws the chart", async ({ page }) => {
  await open(page);
  const before = await pivotValue(page, DIP_MONTH, DIP_REGION);
  const drawnBefore = await chartImage(page).innerHTML();

  await page.getByRole("button", { name: "Go to the order" }).click();
  const formulaBar = page.getByRole("textbox", { name: "Formula bar" });
  const revenue = Number(await formulaBar.inputValue());
  await page.keyboard.type(String(revenue + REVENUE_INCREASE));
  await page.keyboard.press("Enter");

  await expect
    .poll(() => pivotValue(page, DIP_MONTH, DIP_REGION))
    .toBeCloseTo((before ?? 0) + REVENUE_INCREASE, 6);
  await page.getByRole("tab", { name: "Summary" }).click();
  await expect.poll(() => chartImage(page).innerHTML()).not.toBe(drawnBefore);
});

test("a selected chart moves with the arrow keys and undo puts it back", async ({ page }) => {
  await open(page);
  const start = await chartAnchor(page);

  await chart(page).click();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await chartAnchor(page))?.offsetX).toBe((start?.offsetX ?? 0) + 1);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => chartAnchor(page)).toEqual(start);
});

test("a chart partly out of view stays at its cells when it gets focus", async ({ page }) => {
  await open(page);
  // Narrow enough that the chart runs past the grid's right edge.
  await page.setViewportSize({ width: 1100, height: 900 });
  const box = chart(page);
  const before = await box.boundingBox();

  // Focus and scrollIntoView are what keyboard users, screen readers and
  // find-in-page do; neither may slide the chart away from its anchor cell.
  await box.evaluate((element) => {
    element.focus();
    element.scrollIntoView({ inline: "end" });
  });

  expect((await box.boundingBox())?.x).toBe(before?.x);
});

test("Insert › Chart adds a chart for the selected cells", async ({ page }) => {
  await open(page);
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill("A2:C8");
  await nameBox.press("Enter");

  const ribbon = page.getByRole("region", { name: "Ribbon" });
  await ribbon.getByRole("tab", { name: "Insert" }).click();
  await ribbon.getByRole("button", { name: "Chart", exact: true }).click();

  await expect
    .poll(() =>
      page.evaluate((sheet) => window.__sheetwriteAnalysisGrid?.getCharts(sheet).length, SUMMARY),
    )
    .toBe(2);
  await expect(chartObjects(page)).toHaveCount(2);
});

test("the Chart menu inserts the picked kind", async ({ page }) => {
  await open(page);
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill("A2:C8");
  await nameBox.press("Enter");

  const ribbon = page.getByRole("region", { name: "Ribbon" });
  await ribbon.getByRole("tab", { name: "Insert" }).click();
  await ribbon.getByRole("button", { name: "Chart options" }).click();
  await page.getByRole("menuitem", { name: "Pie" }).click();

  await expect
    .poll(() =>
      page.evaluate(
        (sheet) => window.__sheetwriteAnalysisGrid?.getCharts(sheet).map((chart) => chart.kind),
        SUMMARY,
      ),
    )
    .toEqual(["line", "pie"]);
});

test("a chart's right-click menu deletes it, and undo brings it back", async ({ page }) => {
  await open(page);

  // The menu closes on scroll, as Excel's does. Bring the chart into view and
  // let that scroll's event fire first, so it does not close the new menu.
  await chart(page).scrollIntoViewIfNeeded();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await chart(page).click({ button: "right" });
  const menu = page.locator(".sheetwrite-context-menu");
  await expect(menu.getByText("Edit chart")).toBeVisible();
  await menu.getByText("Delete chart").click();
  await expect(chartObjects(page)).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(chartObjects(page)).toHaveCount(1);
});
