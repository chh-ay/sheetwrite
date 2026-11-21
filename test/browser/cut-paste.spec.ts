import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { expect, test } from "./fixtures.js";

// Excel's Cut and Paste moves the cells and the references to them, in every
// browser engine (#921): Firefox and WebKit keep only plain text and HTML on
// the clipboard.
// https://support.microsoft.com/en-us/office/move-or-copy-cells-and-cell-contents-803d65eb-6a3e-4534-8c6f-ff12d1c4139e

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

async function open(page: Page, browserName: string): Promise<void> {
  // Firefox and WebKit let a page use the clipboard after a key press.
  if (browserName === "chromium") {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  await page.setViewportSize({ width: 1_600, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
}

/** Select the cell at `row`, `col` of the active sheet, or the range down to `toRow`. */
async function select(page: Page, row: number, col: number, toRow = row): Promise<void> {
  await page.evaluate(
    ([row, col, toRow]) => {
      const grid = window.__sheetwriteSpreadsheetGrid!;
      const sheet = grid.getActiveSheet();
      grid.setSelection({
        kind: "range",
        range: { sheet, start: { row, col }, end: { row: toRow, col } },
      });
    },
    [row, col, toRow] as const,
  );
  await page.locator(".sheetwrite").first().focus();
}

/** The values of A40:A41 and D40:D41, and the formula in C40. */
function state(page: Page) {
  return page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    const sheet = grid.getActiveSheet();
    const value = (row: number, col: number) => grid.store.getCell({ sheet, row, col }).resolved;
    return {
      source: [value(39, 0), value(40, 0)],
      target: [value(39, 3), value(40, 3)],
      formula: grid.store.getFormula({ sheet, row: 39, col: 2 }),
    };
  });
}

test("cut and paste moves the cells and their references @portability", async ({
  page,
  browserName,
}) => {
  await open(page, browserName);
  await page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    const sheet = grid.getActiveSheet();
    grid.applyTransaction({
      patches: [
        { op: "set", addr: { sheet, row: 39, col: 0 }, value: { kind: "literal", value: 10 } },
        { op: "set", addr: { sheet, row: 40, col: 0 }, value: { kind: "literal", value: 20 } },
        {
          op: "set",
          addr: { sheet, row: 39, col: 2 },
          value: { kind: "formula", src: "=A40+A41" },
        },
      ],
    });
  });

  await select(page, 39, 0, 40);
  await page.keyboard.press("ControlOrMeta+x");
  await expect(page.locator("[data-sheetwrite-cut]").first()).toBeVisible();
  expect((await state(page)).source).toEqual([10, 20]);

  await select(page, 39, 3);
  await page.keyboard.press("ControlOrMeta+v");
  await expect
    .poll(() => state(page), { timeout: 15_000 })
    .toEqual({ source: [null, null], target: [10, 20], formula: "=D40+D41" });
  await expect(page.locator("[data-sheetwrite-cut]")).toHaveCount(0);
});
