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
  try {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  } catch (error) {
    console.log(`PROBE ${browserName} grant failed: ${String(error).slice(0, 200)}`);
  }
  page.on("console", (message) => {
    if (message.text().startsWith("PROBE")) console.log(`${browserName} ${message.text()}`);
  });
  await page.addInitScript(() => {
    const clipboard = navigator.clipboard as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    for (const name of ["read", "readText", "write", "writeText"]) {
      const original = clipboard[name]?.bind(clipboard);
      if (!original) continue;
      clipboard[name] = async (...args: unknown[]) => {
        try {
          const result = await original(...args);
          const types = name === "read" ? (result as ClipboardItem[]).map((item) => item.types.join(",")).join("|") : "";
          console.log(`PROBE ${name} ok ${types}`);
          return result;
        } catch (error) {
          console.log(`PROBE ${name} failed ${String(error)}`);
          throw error;
        }
      };
    }
  });
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

/** The values of A3:A4 and D3:D4, and the formula in C3. */
function state(page: Page) {
  return page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    const sheet = grid.getActiveSheet();
    const value = (row: number, col: number) => grid.store.getCell({ sheet, row, col }).resolved;
    return {
      source: [value(2, 0), value(3, 0)],
      target: [value(2, 3), value(3, 3)],
      formula: grid.store.getFormula({ sheet, row: 2, col: 2 }),
    };
  });
}

test("cut and paste moves the cells and their references @portability", async ({
  page,
  browserName,
}) => {
  await open(page, browserName);
  // Cells near the top, so the cut's moving border is on screen.
  await page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    const sheet = grid.getActiveSheet();
    grid.applyTransaction({
      patches: [
        { op: "set", addr: { sheet, row: 2, col: 0 }, value: { kind: "literal", value: 10 } },
        { op: "set", addr: { sheet, row: 3, col: 0 }, value: { kind: "literal", value: 20 } },
        { op: "set", addr: { sheet, row: 2, col: 2 }, value: { kind: "formula", src: "=A3+A4" } },
      ],
    });
  });

  await select(page, 2, 0, 3);
  await page.keyboard.press("ControlOrMeta+x");
  await expect(page.locator("[data-sheetwrite-cut]").first()).toBeVisible();
  expect((await state(page)).source).toEqual([10, 20]);

  await select(page, 2, 3);
  await page.keyboard.press("ControlOrMeta+v");
  await expect
    .poll(() => state(page), { timeout: 15_000 })
    .toEqual({ source: [null, null], target: [10, 20], formula: "=D3+D4" });
  await expect(page.locator("[data-sheetwrite-cut]")).toHaveCount(0);
});
