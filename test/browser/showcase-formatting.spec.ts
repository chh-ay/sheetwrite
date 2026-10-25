import { expect, test } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { siteUrl } from "./playwright.config.js";

declare global {
  interface Window {
    __sheetwriteFormattingGrid?: Grid;
  }
}

const REVENUE = { sheet: "budget", row: 2, col: 1 };

test("formatting controls change the live budget and XLSX preserves the edited styles", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(siteUrl("/showcases/formatting/"));
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
  await page.getByRole("button", { name: "Export → re-import XLSX", exact: true }).click();
  await expect(page.getByTestId("formatting-roundtrip")).toContainText("Verified");
  await expect(page.getByTestId("formatting-roundtrip")).toContainText("0 differences");
  await expect(page.locator(".sw-formatting-imported canvas")).toBeAttached();

  for (const colorTheme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, colorTheme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorTheme);
    expect(
      await page
        .locator(".sw-formatting-frame")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).not.toBe("rgba(0, 0, 0, 0)");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
