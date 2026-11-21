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
/** A chart about as wide as the docs figure workbook, in a window that shows all of it. */
const WIDE_CHART = { width: 1_200, height: 420 };
const WIDE_VIEWPORT = { width: 1_920, height: 1_080 };

async function open(page: Page) {
  await page.goto("/showcases/analysis/");
  await expect(page.getByRole("button", { name: "Go to the order" })).toBeEnabled({
    timeout: 30_000,
  });
}

function charts(page: Page) {
  return page.evaluate((sheet) => window.__sheetwriteAnalysisGrid?.getCharts(sheet) ?? [], SUMMARY);
}

const chart = (page: Page) => page.getByRole("group", { name: /Monthly revenue by region/ });
const chartObjects = (page: Page) => page.locator('[aria-roledescription="chart"]');

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
  await expect(chartObjects(page)).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest(".sheetwrite") != null))
    .toBe(true);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(chartObjects(page)).toHaveCount(1);

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
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill("A2:C8");
  await nameBox.press("Enter");
  const ribbon = page.getByRole("region", { name: "Ribbon" });
  await ribbon.getByRole("tab", { name: "Insert" }).click();
  // A2 is in the pivot, so PivotChart and its "PivotChart options" show too.
  await ribbon.getByRole("button", { name: "Chart options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pie" }).click();
  await expect
    .poll(async () => (await charts(page)).map((entry) => entry.kind))
    .toEqual(["line", "pie"]);
  await expect(chartObjects(page)).toHaveCount(2);
});

// #700: a wide bar chart drew its value-axis labels into each other.
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
  await expect(chartObjects(page)).toHaveCount(2);

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
  let previousBackground = "rgb(11, 11, 12)";
  for (const scheme of ["light", "dark"]) {
    await page.evaluate((colorScheme) => {
      document.documentElement.dataset.theme = colorScheme;
    }, scheme);
    await expect.poll(async () => (await colors()).grid.bg).not.toBe(previousBackground);
    const site = await colors();
    expect(site.charts).toEqual([site.grid, site.grid]);
    previousBackground = site.grid.bg;
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
