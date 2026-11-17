import type { Page } from "@playwright/test";

import type { Grid } from "../../packages/core/src/types.js";
import { expect, test } from "./fixtures.js";

// Data validation in a browser build: Excel's error alert and input message,
// labelled and keyboard-complete, giving the grid its focus back.

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1_600, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
}

/** Give B2:B50 a list rule with `fields`, select B50 and focus the grid. */
async function regionRule(page: Page, fields: Record<string, unknown>): Promise<void> {
  await page.evaluate((extra) => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    const sheet = grid.getActiveSheet();
    grid.setValidationRule({
      id: "region",
      range: { sheet, start: { row: 1, col: 1 }, end: { row: 49, col: 1 } },
      condition: { kind: "list", values: ["North", "South", "East", "West"] },
      policy: "reject",
      ...extra,
    });
    grid.setSelection({ kind: "cell", addr: { sheet, row: 49, col: 1 } });
  }, fields);
  await page.locator(".sheetwrite").first().focus();
}

function regionAt50(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid!;
    return grid.store.getCell({ sheet: grid.getActiveSheet(), row: 49, col: 1 }).resolved;
  });
}

test("a refused entry shows Excel's Stop alert, from the keyboard @portability", async ({
  page,
}) => {
  await open(page);
  await regionRule(page, { inputTitle: "Region", inputMessage: "Pick a sales region." });
  await expect(page.locator(".sheetwrite-input-message")).toHaveText("RegionPick a sales region.");
  const before = await regionAt50(page);

  await page.keyboard.type('="Nowhere"');
  await page.keyboard.press("Enter");
  const alert = page.getByRole("alertdialog", { name: "Data Validation" });
  await expect(alert).toContainText(
    "This value doesn't match the data validation restrictions defined for this cell.",
  );
  const retry = alert.getByRole("button", { name: "Retry" });
  await expect(retry).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(alert.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(alert).toHaveCount(0);
  const editor = page.locator("textarea.sheetwrite-editor");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('="Nowhere"');

  await page.keyboard.press("Enter");
  await expect(alert).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(alert).toHaveCount(0);
  await expect(page.locator(".sheetwrite").first()).toBeFocused();
  expect(await regionAt50(page)).toEqual(before);
});

test("a Warning alert keeps the entry on Yes and an Information alert on OK @portability", async ({
  page,
}) => {
  await open(page);
  await regionRule(page, { policy: "warn", errorTitle: "Region", helpText: "Not a region." });
  await page.keyboard.type("Nowhere");
  await page.keyboard.press("Enter");
  const warning = page.getByRole("alertdialog", { name: "Region" });
  await expect(warning).toContainText("Not a region.Continue?");
  await expect(warning.getByRole("button", { name: "No" })).toBeFocused();
  await warning.getByRole("button", { name: "Yes" }).click();
  await expect(warning).toHaveCount(0);
  expect(await regionAt50(page)).toBe("Nowhere");

  await regionRule(page, { policy: "warn", errorStyle: "information" });
  await page.keyboard.type("Elsewhere");
  await page.keyboard.press("Enter");
  const information = page.getByRole("alertdialog", { name: "Data Validation" });
  await expect(information.getByRole("button", { name: "OK" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(information).toHaveCount(0);
  expect(await regionAt50(page)).toBe("Elsewhere");
});

test("a list cell's arrow opens its list, and typing filters it, from the keyboard @portability", async ({
  page,
}) => {
  await open(page);
  await regionRule(page, {
    condition: {
      kind: "list",
      values: ["North", "South", "East", "West", "North-East", "South-West"],
    },
  });
  const arrow = page.locator(".sheetwrite-list-button");
  await expect(arrow).toBeVisible();
  const box = await arrow.boundingBox();
  if (!box) throw new Error("expected the dropdown arrow");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const list = page.getByRole("listbox");
  await expect(list.getByRole("option")).toHaveCount(6);
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(page.locator(".sheetwrite").first()).toBeFocused();

  await page.keyboard.type("we");
  const combobox = page.getByRole("combobox");
  await expect(combobox).toBeFocused();
  await expect(combobox).toHaveValue("we");
  await expect(list.getByRole("option")).toHaveText(["West", "South-West"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(list).toHaveCount(0);
  expect(await regionAt50(page)).toBe("South-West");

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Alt+ArrowDown");
  await expect(list.getByRole("option")).toHaveCount(6);
  await page.keyboard.press("Tab");
  await expect(list).toHaveCount(0);
});
