import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { expect, test } from "./fixtures.js";

declare global {
  interface Window {
    __sheetwriteAnalysisGrid?: Grid;
  }
}

const SUMMARY = "summary";
const PIVOT = "revenue-by-month";
const CHART = "revenue-trend";
/** The story's dip: EMEA in its price-change month. */
const DIP_REGION = "EMEA";
const DIP_MONTH = "2026-03";
const REVENUE_INCREASE = 50_000;
/** A chart about as wide as the docs figure workbook, in a window that shows all of it. */
const WIDE_CHART = { width: 1_200, height: 420 };
const WIDE_VIEWPORT = { width: 1_920, height: 1_080 };

async function open(page: Page) {
  await page.goto("/showcases/analysis/");
  await expect(page.getByRole("button", { name: "Go to the order" })).toBeEnabled({
    timeout: 30_000,
  });
}

/** The pivot's value for one month and region, found by its labels, not its position. */
function pivot_value(page: Page, month: string, region: string) {
  return page.evaluate(
    ([sheet, id, row_label, col_label]) => {
      const result = window.__sheetwriteAnalysisGrid?.getPivotResult(sheet, id);
      if (!result || result.status !== "ok") return null;
      const at = (row: number, col: number) => result.cells[row * result.cols + col];
      // Column labels and value captions share the header rows: search them all.
      let col = -1;
      for (let c = result.labelCols; c < result.cols; c++) {
        for (let r = 0; r < result.headerRows; r++) if (at(r, c) === col_label) col = c;
      }
      let row = -1;
      for (let r = result.headerRows; r < result.rows; r++) {
        if (at(r, result.labelCols - 1) === row_label) row = r;
      }
      return row < 0 || col < 0 ? null : Number(at(row, col));
    },
    [SUMMARY, PIVOT, month, region] as const,
  );
}

function charts(page: Page) {
  return page.evaluate((sheet) => window.__sheetwriteAnalysisGrid?.getCharts(sheet) ?? [], SUMMARY);
}

const chart = (page: Page) => page.getByRole("group", { name: /Monthly revenue by region/ });
const chart_image = (page: Page) =>
  chart(page).getByRole("img", { name: /Monthly revenue by region/ });
const chart_objects = (page: Page) => page.locator('[aria-roledescription="chart"]');

test("editing an order moves its pivot total and redraws the chart", async ({ page }) => {
  await open(page);
  // One series per region, named from the pivot's region labels.
  const description = await chart_image(page).locator("desc").textContent();
  for (const region of ["Americas", "APAC", DIP_REGION, "LATAM"]) {
    expect(description).toContain(region);
  }
  const before = (await pivot_value(page, DIP_MONTH, DIP_REGION)) ?? 0;
  expect(before).toBeGreaterThan(0);
  const drawn_before = await chart_image(page).innerHTML();

  await page.getByRole("button", { name: "Go to the order" }).click();
  const revenue = Number(await page.getByRole("textbox", { name: "Formula bar" }).inputValue());
  await page.keyboard.type(String(revenue + REVENUE_INCREASE));
  await page.keyboard.press("Enter");
  await expect
    .poll(() => pivot_value(page, DIP_MONTH, DIP_REGION))
    .toBeCloseTo(before + REVENUE_INCREASE, 6);
  await page.getByRole("tab", { name: "Summary" }).click();
  await expect.poll(() => chart_image(page).innerHTML()).not.toBe(drawn_before);
});

test("a selected chart moves with the arrow keys, deletes from its menu, stays at its cells on focus, and undo works", async ({
  page,
}) => {
  await open(page);
  const anchor = async () => (await charts(page)).find((entry) => entry.id === CHART)?.anchor;
  const start = await anchor();
  await chart(page).click();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await anchor())?.offsetX).toBe((start?.offsetX ?? 0) + 1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(anchor).toEqual(start);

  // The chart's context menu deletes it, focus stays in the grid, and undo
  // brings it back.
  await chart(page).click({ button: "right" });
  const menu = page.locator(".sheetwrite-context-menu");
  await expect(menu.getByText("Edit chart")).toBeVisible();
  await menu.getByText("Delete chart").click();
  await expect(chart_objects(page)).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest(".sheetwrite") != null))
    .toBe(true);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(chart_objects(page)).toHaveCount(1);

  // Narrow enough that the chart runs past the grid's right edge. Focus and
  // scrollIntoView, as keyboard users and find-in-page do, must not slide the
  // chart away from its anchor cell.
  await page.setViewportSize({ width: 1100, height: 900 });
  const box = chart(page);
  const before = await box.boundingBox();
  await box.evaluate((element) => {
    element.focus();
    element.scrollIntoView({ inline: "end" });
  });
  expect((await box.boundingBox())?.x).toBe(before?.x);
});

test("the Chart menu inserts the picked kind", async ({ page }) => {
  await open(page);
  const name_box = page.getByRole("textbox", { name: "Cell reference" });
  await name_box.fill("A2:C8");
  await name_box.press("Enter");
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  await ribbon.getByRole("tab", { name: "Insert" }).click();
  // A2 is in the pivot, so PivotChart and its "PivotChart options" show too.
  await ribbon.getByRole("button", { name: "Chart options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pie" }).click();
  await expect
    .poll(async () => (await charts(page)).map((entry) => entry.kind))
    .toEqual(["line", "pie"]);
  await expect(chart_objects(page)).toHaveCount(2);
});

test("a wide bar PivotChart keeps its value-axis labels apart", async ({ page }) => {
  await page.setViewportSize(WIDE_VIEWPORT);
  await open(page);
  await page.evaluate(
    ([sheet, id, pivot, size]) => {
      const grid = window.__sheetwriteAnalysisGrid;
      const current = grid?.getCharts(sheet).find((entry) => entry.id === id);
      if (!grid || !current) throw new Error(`Chart ${id} is missing`);
      const anchor = { ...current.anchor, width: size.width, height: size.height };
      grid.setChart({ ...current, kind: "bar", pivot, series: [], anchor }, sheet);
    },
    [SUMMARY, CHART, PIVOT, WIDE_CHART] as const,
  );
  const image = page.getByRole("img", { name: /Monthly revenue by region \(Bar chart\)/ });
  await expect(image.locator(".sheetwrite-chart-bar").first()).toBeAttached();

  const labels = await image.locator(".sheetwrite-chart-value-axis text").evaluateAll((nodes) =>
    nodes
      .map((node) => node.getBoundingClientRect())
      .map((box) => ({ left: box.left, right: box.right }))
      .sort((first, second) => first.left - second.left),
  );
  expect(labels.length).toBeGreaterThan(2);
  labels.slice(1).forEach((label, index) => {
    expect(label.left).toBeGreaterThanOrEqual(labels[index]?.right ?? Number.POSITIVE_INFINITY);
  });
});

// #727: a chart over the cells painted the stylesheet's background, not the grid's theme.
test("a chart and a PivotChart sit on the grid's themed background", async ({ page }) => {
  await open(page);
  await page.evaluate(
    ([sheet, id, pivot]) => {
      const grid = window.__sheetwriteAnalysisGrid;
      const current = grid?.getCharts(sheet).find((entry) => entry.id === id);
      if (!grid || !current) throw new Error(`Chart ${id} is missing`);
      const anchor = { ...current.anchor, row: current.anchor.row + 20 };
      grid.setChart(
        { ...current, id: "pivot-chart", kind: "column", pivot, series: [], anchor },
        sheet,
      );
    },
    [SUMMARY, CHART, PIVOT] as const,
  );
  await expect(chart_objects(page)).toHaveCount(2);

  /** The grid's effective background and text colour, and what each chart computes. */
  const colors = () =>
    page.evaluate(() => {
      const probe = document.createElement("span");
      document.body.append(probe);
      const resolve = (color: string | undefined) => {
        probe.style.color = color ?? "";
        return getComputedStyle(probe).color;
      };
      const effective = window.__sheetwriteAnalysisGrid?.getEffectiveTheme();
      const grid = { bg: resolve(effective?.bg), fg: resolve(effective?.fg) };
      probe.remove();
      const charts = [...document.querySelectorAll('[aria-roledescription="chart"]')].map(
        (frame) => {
          const style = getComputedStyle(frame);
          return { bg: style.backgroundColor, fg: style.color };
        },
      );
      return { grid, charts };
    });

  // The showcase themes its grid from the site's tokens and follows the site's
  // scheme. rgb(11, 11, 12) is the stylesheet's dark default, which the charts kept before.
  let previous_background = "rgb(11, 11, 12)";
  for (const scheme of ["light", "dark"]) {
    await page.evaluate((color_scheme) => {
      document.documentElement.dataset.theme = color_scheme;
    }, scheme);
    await expect.poll(async () => (await colors()).grid.bg).not.toBe(previous_background);
    const site = await colors();
    expect(site.grid.bg).not.toBe("rgb(11, 11, 12)");
    expect(site.charts).toEqual([site.grid, site.grid]);
    previous_background = site.grid.bg;
  }

  for (const [theme, computed] of [
    [
      { bg: "#101828", fg: "#e5e7eb" },
      { bg: "rgb(16, 24, 40)", fg: "rgb(229, 231, 235)" },
    ],
    [
      { bg: "#fdf6e3", fg: "#1f2937" },
      { bg: "rgb(253, 246, 227)", fg: "rgb(31, 41, 55)" },
    ],
  ] as const) {
    await page.evaluate((palette) => window.__sheetwriteAnalysisGrid?.setTheme(palette), theme);
    const themed = await colors();
    expect(themed.grid).toEqual(computed);
    expect(themed.charts).toEqual([themed.grid, themed.grid]);
  }
});
