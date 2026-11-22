import type { Grid } from "../../packages/core/src/types.js";
import { expect, fitsViewport, test } from "./fixtures.js";

declare global {
  interface Window {
    __sheetwriteFormattingGrid?: Grid;
  }
}

const REVENUE = { sheet: "budget", row: 2, col: 1 };

test("formatting controls change the live budget and XLSX preserves the edited styles", async ({
  page,
}) => {
  await page.goto("/showcases/formatting/");
  await expect(page.getByTestId("formatting-status")).toContainText("Ready");
  await expect(page.locator(".sw-formatting-grid canvas")).toBeAttached();

  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Georgia", exact: true }).click();
  await page.getByRole("button", { name: "bottom", exact: true }).click();
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await page.getByRole("button", { name: "Percentage", exact: true }).click();
  const styled = await page.evaluate((address) => {
    const grid = window.__sheetwriteFormattingGrid;
    if (!grid) throw new Error("Formatting grid missing");
    return grid.store.getCell(address);
  }, REVENUE);
  expect(styled.resolved).toBe(84250);
  expect(styled.style).toMatchObject({
    bold: true,
    fontFamily: "Georgia",
    verticalAlign: "bottom",
    numberFormat: "0.00%",
    border: { top: { width: 2 }, left: { style: "dashed" }, right: { style: "dotted" } },
  });

  await page.getByRole("button", { name: "General", exact: true }).click();
  expect(
    await page.evaluate(
      (address) => window.__sheetwriteFormattingGrid?.store.getCell(address).style?.numberFormat,
      REVENUE,
    ),
  ).toBe("General");
  await page.getByRole("button", { name: "Export, then re-import XLSX", exact: true }).click();
  await expect(page.getByTestId("formatting-roundtrip")).toContainText("Verified");
  await expect(page.getByTestId("formatting-roundtrip")).toContainText("0 differences");
  await expect(page.locator(".sw-formatting-imported canvas")).toBeAttached();

  for (const color_theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, color_theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", color_theme);
    expect(
      await page
        .locator(".sw-showcase")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).not.toBe("rgba(0, 0, 0, 0)");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await fitsViewport(page)).toBe(true);
});
