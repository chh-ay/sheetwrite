import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { expect, test } from "./fixtures.js";

// The find bar's Options and Find All in a browser build, driven by real keys:
// Excel's Alt access keys, the Within choice and a click on a Find All result.

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

/** Open the spreadsheet showcase and put a marker on its first two visible sheets. */
async function openWithMarkers(page: Page): Promise<string[]> {
  await page.setViewportSize({ width: 1_600, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  return page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    const sheets = grid.store
      .getWorkbook()
      .sheets.filter((sheet) => (sheet.visibility ?? "visible") === "visible")
      .map((sheet) => sheet.id);
    const [first = "", second = ""] = sheets;
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: first, row: 0, col: 0 },
          value: { kind: "literal", value: "zq-marker" },
        },
        {
          op: "set",
          addr: { sheet: second, row: 1, col: 1 },
          value: { kind: "literal", value: "ZQ-MARKER" },
        },
      ],
    });
    grid.setActiveSheet(first);
    grid.setSelection({ kind: "cell", addr: { sheet: first, row: 3, col: 3 } });
    return [first, second];
  });
}

test("Options and Find All search the workbook from Excel's keys @portability", async ({
  page,
}) => {
  const [, second] = await openWithMarkers(page);
  await page.locator(".sheetwrite").first().focus();
  await page.keyboard.press("ControlOrMeta+f");
  const find = page.getByRole("textbox", { name: "Find in sheet" });
  await expect(find).toBeFocused();
  await find.fill("zq-marker");
  const count = page.locator(".sheetwrite-find-count");
  await expect(count).toHaveText("1 of 1");

  // Alt+H shows the options and focuses Within, as in Excel's dialog.
  await page.keyboard.press("Alt+h");
  const within = page.locator(".sheetwrite-find-options select").first();
  await expect(within).toBeFocused();
  await within.selectOption("workbook");
  await expect(count).toHaveText(/ of 2$/);

  // Alt+C ticks Match case: only the lower-case marker is left.
  await page.keyboard.press("Alt+c");
  await expect(count).toHaveText("1 of 1");
  await page.keyboard.press("Alt+c");
  await expect(count).toHaveText(/ of 2$/);

  await page.keyboard.press("Alt+i");
  const results = page.getByRole("listbox", { name: "Find all results" });
  await expect(results.getByRole("option")).toHaveCount(2);
  await expect(
    page.locator(".sheetwrite-find-all-results .sheetwrite-find-results-status"),
  ).toHaveText("2 cells found");

  await results.getByRole("option").nth(1).click();
  await expect
    .poll(() => page.evaluate(() => window.__sheetwriteSpreadsheetGrid!.getActiveSheet()))
    .toBe(second);
  expect(await page.evaluate(() => window.__sheetwriteSpreadsheetGrid!.getSelection())).toEqual({
    kind: "cell",
    addr: { sheet: second, row: 1, col: 1 },
  });
});
